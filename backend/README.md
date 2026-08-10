# Backend — локальный запуск

## Требования

- Docker / Docker Compose
- Go 1.26+ (нужен только для локальной разработки без Docker)
- Make

## Версии компонентов

| Компонент       | Версия              |
|-----------------|---------------------|
| PostgreSQL      | v18                 |
| pgvector        | v0.8.6              |
| golang-migrate  | v4.19.1             |
| TEI (embeddings) | ghcr.io/huggingface/text-embeddings-inference:cpu-1.9 |

## Запуск одной командой

Весь проект (БД + миграции + MinIO + TEI + backend + **frontend**) поднимается одной командой из корня репозитория:

```bash
cp .env.example .env   # при необходимости отредактируйте переменные
make up                # = docker compose up -d --build
```

После старта:

- UI: http://localhost:3000
- API: http://localhost:8080

`make up` поднимает сервисы по цепочке зависимостей:

1. `db` — PostgreSQL с pgvector, поднимается и ждёт `healthcheck` (`pg_isready`).
2. `migrate` — официальный образ `migrate/migrate`, применяет все `.sql`-миграции
   из `backend/migrations` к базе после того, как `db` стал healthy, и завершается.
3. `minio` / `minio-init`, `tei` — хранилище фото и embeddings.
4. `app` — backend, стартует после успешных migrate/minio-init и healthy TEI.
5. `frontend` — nginx со статикой + прокси `/api` и `/s3`.

Остановить и полностью удалить контейнеры и volume с данными БД:

```bash
make down
```

Полезные команды:

```bash
make logs      # логи бэкенда
make db-logs   # логи БД
make test      # go test ./... внутри backend
```

## Локальный запуск без Docker (опционально)

Если нужно запускать сам бэкенд напрямую на хосте (например, для отладки),
поднимите только БД и миграции через Docker, а бэкенд — через `go run`:

```bash
docker compose up -d db migrate
cd backend && make run   # или: cd backend && go run ./cmd/api
```

В этом случае в `.env` должен быть `DATABASE_URL` с хостом `localhost`
(см. `.env.example`), а не `db`, как внутри docker-compose сети.

## Проверка

- Если БД недоступна, приложение завершается с понятной ошибкой:
  `database is unreachable: ...`

## Миграции

Миграции лежат в `backend/migrations` в формате `<номер>_<имя>.up.sql` /
`.down.sql` (формат `golang-migrate`). Накатываются они не самим приложением,
а отдельным сервисом `migrate` в docker-compose (официальный образ
`migrate/migrate`) — это гарантирует, что схема применяется ровно один раз,
до старта приложения, без гонок и без прав на миграции у самого сервиса `app`.

Чтобы накатить/откатить миграции вручную (например, при локальной разработке):

```bash
# применить все миграции
docker compose run --rm migrate -path=/migrations -database="postgres://tricky:tricky@db:5432/tricky_exchanger?sslmode=disable" up

# откатить последнюю миграцию
docker compose run --rm migrate -path=/migrations -database="postgres://tricky:tricky@db:5432/tricky_exchanger?sslmode=disable" down 1
```

Новая миграция добавляется парой файлов с следующим порядковым номером,
например `000005_add_something.up.sql` / `000005_add_something.down.sql`.

## Архитектура

Код разложен по слоям (layer-first), а не по фичам: сначала слой, внутри слоя — пакет фичи.

```
internal/
  entity/                 # сущности предметной области (структуры + доменные ошибки)
  repository/<feature>/   # доступ к БД (postgres), реализует контракты из service/<feature>
  service/<feature>/      # бизнес-логика; contracts.go — интерфейсы того, что нужно от repository/infrastructure
  handler/<feature>/      # HTTP-хендлеры (gin); contracts.go — интерфейс того, что нужно от service
  infrastructure/         # технические клиенты без бизнес-логики (mailer, codestore, jwt, embeddings, pgvector)
  middleware/             # сквозные gin-мидлвари, не привязанные к одной фиче (сейчас — Auth, проверка JWT)
  api/                    # общий формат HTTP-ответа/ошибки (internal/api/response.go)
  core/                   # конфиг, логгер, БД-пул, роутер
```

Слой выше зависит от слоя ниже только через интерфейс из своего `contracts.go`, реализацию
получает явным параметром конструктора (dependency injection руками, без DI-фреймворка) —
см. `internal/service/user`, `internal/handler/user` как референс.

## Обработка ошибок

- **Бизнес-ошибки** (`entity/errors.go`) — то, что возвращает service-слой вызывающей стороне
  (`entity.ErrUserAlreadyExists` и т.п.).
- **Ошибки БД** (`repository/errors.go`) — `repository.MapDBError` превращает специфичные для
  pgx ошибки (например, нарушение UNIQUE) в `repository.ErrDuplicateKey`/`ErrNotFound`; выше
  репозитория никто не знает про коды ошибок PostgreSQL.
- **HTTP-ответ** (`internal/api/response.go`) — единый формат по всему проекту:
  `{"error": "человеческое сообщение", "code": 400}`. Хендлер сам решает, в какой HTTP-статус
  превратить бизнес-ошибку (`errors.Is` + `switch`), см. `internal/handler/user/register.go`.

## HTTP-каркас

Сервер поднимается на `SERVER_PORT` (по умолчанию `8080`, см. `.env.example`).

- `GET /healthz` — liveness-проверка (не под `/api/v1`, используется докером/оркестратором).
- `GET /api/v1/ping` — тестовая ручка каркаса (`internal/core/router/ping_handler.go`),
  показывает паттерн подключения новых ручек. Удалить, когда появится первая настоящая фича.
- `POST /api/v1/auth/register` — регистрация пользователя, сразу создаёт сессию.
- `POST /api/v1/auth/login` — вход по email/паролю.
- `GET /api/v1/auth/me` 🔒 — текущий пользователь по токену (восстановление сессии на фронте).
- `POST /api/v1/auth/change-password` 🔒 — смена пароля залогиненным пользователем (это **не**
  восстановление пароля по коду с почты — та ручка появится отдельно).
- `POST /api/v1/auth/logout` 🔒 — завершение текущей сессии.

🔒 — требует заголовок `Authorization: Bearer <jwt>`, проверяется мидлварью
`middleware.Auth` (`internal/middleware/auth.go`).

### Аутентификация

`POST /api/v1/auth/register`

Запрос:

```json
{ "fullName": "Иван Петров", "email": "ivan@example.com", "password": "supersecret" }
```

Успех (`201`):

```json
{
  "token": "<jwt>",
  "user": { "id": "uuid", "fullName": "Иван Петров", "email": "ivan@example.com" }
}
```

Ошибки: `400` — невалидные данные (пустые поля, некорректный email, пароль короче 8 символов),
`409` — email уже зарегистрирован.

`POST /api/v1/auth/login`

Запрос:

```json
{ "email": "ivan@example.com", "password": "supersecret" }
```

Успех (`200`) — тот же формат ответа, что у `register`. Ошибка: `401` для любой неверной пары
email/пароль (специально не различаем "нет такого email" и "неверный пароль", чтобы не давать
перебором проверять зарегистрированные email).

`GET /api/v1/auth/me` 🔒 — без тела, в ответ (`200`) отдаёт объект `user` (как в `register`, но
без `token`). `401` — нет/невалиден токен.

`POST /api/v1/auth/change-password` 🔒

Запрос:

```json
{ "currentPassword": "supersecret", "newPassword": "newsecret1", "newPasswordConfirmation": "newsecret1" }
```

Успех (`200`): `{ "message": "password_changed" }`. Ошибки: `400` — неверный текущий пароль,
пароли не совпадают или новый пароль короче 8 символов; `401` — нет/невалиден токен.

`POST /api/v1/auth/logout` 🔒 — без тела, в ответ (`200`) `{ "message": "logged_out" }`. Сессии в
этом MVP — стейтлесс JWT без хранилища токенов, поэтому сервер не инвалидирует конкретный токен
(он живёт до истечения TTL, `JWTTokenTTL` в конфиге) — ручка подтверждает, что запрос пришёл с
валидным токеном, а сам токен удаляется на клиенте.

### Восстановление пароля

Три незащищённых ручки под `/api/v1/account/password-recovery/` (пути с завершающим слэшем —
так зафиксировано в `PROJECT.md` §4.1, это официальный контракт, не мок фронта — просто
совпадает с ним):

`POST /account/password-recovery/send-code/`

```json
{ "email": "ivan@example.com" }
```

Генерирует 6-значный код, кладёт его хэш (SHA-256) во временное in-memory хранилище
(`internal/infrastructure/codestore`, TTL 10 минут — `RecoveryCodeTTL` в конфиге) и отправляет
код на почту через SMTP (`internal/infrastructure/mailer`, `net/smtp` + `net/mail` для валидации
адреса). Успех (`200`): `{ "message": "code_sent" }`. Ошибки: `404` — email не зарегистрирован,
`400` — некорректный email, `500` — не удалось отправить письмо (например, SMTP не настроен).

`POST /account/password-recovery/verify-code/`

```json
{ "email": "ivan@example.com", "code": "123456" }
```

Только проверяет код, **не расходует** его — нужен исключительно для UX (сказать пользователю
"код неверный" сразу, не заставляя сначала вводить новый пароль). Успех (`200`):
`{ "message": "code_valid" }`. `400` — код неверный/истёк или email не найден.

`POST /account/password-recovery/reset-password/`

```json
{ "email": "ivan@example.com", "code": "123456", "password": "new-password" }
```

Финальный и единственный авторитетный шаг: заново проверяет код (не полагаясь на предыдущий
вызов `verify-code`), меняет пароль и гасит код, чтобы его нельзя было использовать повторно.
Успех (`200`): `{ "message": "password_changed" }`. `400` — код неверный/истёк или пароль короче
8 символов, `404` — email не зарегистрирован.

**SMTP-конфигурация** (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`,
см. `.env.example`) — не обязательна для старта сервера: без неё поднимется весь остальной
бэкенд, сломается только сама отправка письма (`send-code` ответит `500`).

**Известное ограничение MVP**: коды хранятся в памяти процесса, а не в БД/Redis — осознанно,
потому что живут 10 минут и не нужны после рестарта. Минус — не переживают рестарт сервера и не
шарятся между несколькими инстансами; при масштабировании на несколько подов `codestore.Store`
меняется на Redis-реализацию с тем же интерфейсом без изменений в `service`-слое. Также нет
рейт-лимита на количество запросов кода/попыток ввода — стоит добавить перед продакшеном.

### Как добавить свою ручку

1. В `internal/handler/<feature>/` реализуйте `Handler` с методами-хендлерами
   (`func (h *Handler) List(c *gin.Context)` и т.п.) — так же, как `handler/user`.
2. Добавьте handler явным параметром в `router.New(...)` (`internal/core/router/router.go`) и
   навесьте его маршруты на группу `api` в теле функции (получат префикс `/api/v1`, который
   ждёт фронтенд). Если ручка требует авторизации — навесьте `middleware.Auth(tokenParser)` на
   группу/маршрут (см. `authProtected` в `router.go` как референс).
3. Создайте handler (через `service` и `repository` фичи) и передайте его в `router.New(...)`
   в `cmd/api/main.go`.

Слои фичи (`entity`, `service/<feature>`, `repository/<feature>`, `handler/<feature>`, при
необходимости `infrastructure/...`) уже созданы как пустые пакеты по структуре из архитектуры
проекта — просто наполняйте их кодом.

## Embeddings (TEI)

Для генерации векторов желания (`WantEmbedding`) бэкенд использует
[Text Embeddings Inference](https://github.com/huggingface/text-embeddings-inference)
с моделью `intfloat/multilingual-e5-small`. В docker-compose он поднимается как
отдельный сервис `tei` и доступен бэкенду по внутреннему адресу `http://tei:80`
(переменная `TEI_URL`), наружу проброшен на `TEI_EXTERNAL_PORT` (по умолчанию `8090`).

Провайдер выбирается конфигом `EMBEDDING_PROVIDER`: `tei` — реальный сервис, либо
`stub` (по умолчанию) — детерминированный клиент-заглушка для разработки без TEI.
Остальные настройки: `VECTOR_DIM`, `EMBEDDING_TIMEOUT`, `MAX_INPUT_LENGTH` — лимит
входного текста в символах (текст усекается до него перед отправкой в модель).

Проверить, что TEI поднялся и отвечает:

```bash
docker compose up -d tei
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8090/health   # ждём 200
curl -s -X POST http://localhost:8090/embed \
  -H "Content-Type: application/json" \
  -d '{"inputs":"хочу iPhone"}'                                          # вернёт вектор
```

Если `EMBEDDING_PROVIDER=tei`, `app` стартует только после того, как `tei` стал
healthy (внутренний healthcheck ходит на `/health`).

## Тесты

Тесты лежат отдельно от кода в `backend/tests/`, путь зеркалит `internal/` (например,
`internal/service/user` → `tests/service/user`), пакет — внешний (`user_test`), чтобы тестировать
только публичный контракт пакета.

```bash
cd backend && go test ./...
```