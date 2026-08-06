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

### 3. Запустить сервер

```bash
make run
```

## Проверка

- Если БД недоступна, приложение завершается с понятной ошибкой:
  `database is unreachable: ...`
- Если расширение pgvector не установлено, вы получите:
  `pgvector extension is NOT installed`
  (миграции, включая создание расширения, будут добавлены отдельной задачей)

## Полезные команды

```bash
make db-down   # остановить БД
make db-logs   # логи БД
```

## HTTP-каркас

Сервер поднимается на `SERVER_PORT` (по умолчанию `8080`, см. `.env.example`).

- `GET /healthz` — liveness-проверка (не под `/api/v1`, используется докером/оркестратором).
- `GET /api/v1/ping` — тестовая ручка каркаса (`internal/core/router/ping_handler.go`),
  показывает паттерн подключения новых ручек. Удалить, когда появится первая настоящая фича.

### Как добавить свою ручку

1. В `internal/features/<feature>/transport/http/` реализуйте `Handler` с методами-хендлерами
   (`func (h *Handler) List(c *gin.Context)` и т.п.) — так же, как `router.PingHandler`.
2. Добавьте handler явным параметром в `router.New(...)` (`internal/core/router/router.go`) и
   навесьте его маршруты на группу `api` в теле функции (получат префикс `/api/v1`, который
   ждёт фронтенд).
3. Создайте handler и передайте его в `router.New(...)` в `cmd/server/main.go`.

Слои фичи (`domain`, `application`, `repository/postgres`, `transport/http`, при необходимости
`infrastructure/...`) уже созданы как пустые пакеты по структуре из архитектуры проекта —
просто наполняйте их кодом.