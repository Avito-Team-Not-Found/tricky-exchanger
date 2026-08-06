# Backend — локальный запуск

## Требования

- Docker / Docker Compose
- Go 1.26+
- Make

## Версии компонентов

| Компонент      | Версия                   |
|----------------|--------------------------|
| PostgreSQL     | 18                       |
| pgvector       | 0.8.6                    |

## Шаги запуска

### 1. Создать окружение

```bash
cp .env.example .env
```

Отредактируйте `.env` при необходимости. Файл `.env` в `.gitignore`, секреты не коммитятся.

### 2. Поднять PostgreSQL с pgvector

```bash
make db-up
```

### 3. Накатить миграции

```bash
make migrate-up   # применить все миграции (включая создание расширения pgvector)
make migrate-down # откатить последнюю миграцию
```

### 4. Запустить сервер

```bash
make run
```

## Проверка

- Если БД недоступна, приложение завершается с понятной ошибкой:
  `database is unreachable: ...`
- Если расширение pgvector не установлено, вы получите:
  `pgvector extension is NOT installed. Run make migrate-up first`

## Полезные команды

```bash
make db-down   # остановить БД
make db-logs   # логи БД
```

## Архитектура

Код разложен по слоям (layer-first), а не по фичам: сначала слой, внутри слоя — пакет фичи.

```
internal/
  entity/                 # сущности предметной области (структуры + доменные ошибки)
  repository/<feature>/   # доступ к БД (postgres), реализует контракты из service/<feature>
  service/<feature>/      # бизнес-логика; contracts.go — интерфейсы того, что нужно от repository/infrastructure
  handler/<feature>/      # HTTP-хендлеры (gin); contracts.go — интерфейс того, что нужно от service
  infrastructure/         # технические клиенты без бизнес-логики (email, jwt, embeddings, pgvector)
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
- `POST /api/v1/auth/register` — регистрация пользователя, сразу создаёт сессию (см. ниже).

### Регистрация пользователя

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

### Как добавить свою ручку

1. В `internal/handler/<feature>/` реализуйте `Handler` с методами-хендлерами
   (`func (h *Handler) List(c *gin.Context)` и т.п.) — так же, как `handler/user`.
2. Добавьте handler явным параметром в `router.New(...)` (`internal/core/router/router.go`) и
   навесьте его маршруты на группу `api` в теле функции (получат префикс `/api/v1`, который
   ждёт фронтенд).
3. Создайте handler (через `service` и `repository` фичи) и передайте его в `router.New(...)`
   в `cmd/api/main.go`.

Слои фичи (`entity`, `service/<feature>`, `repository/<feature>`, `handler/<feature>`, при
необходимости `infrastructure/...`) уже созданы как пустые пакеты по структуре из архитектуры
проекта — просто наполняйте их кодом.

## Тесты

Тесты лежат отдельно от кода в `backend/tests/`, путь зеркалит `internal/` (например,
`internal/service/user` → `tests/service/user`), пакет — внешний (`user_test`), чтобы тестировать
только публичный контракт пакета.

```bash
cd backend && go test ./...
```