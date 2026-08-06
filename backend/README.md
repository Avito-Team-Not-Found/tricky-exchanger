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

После запуска проверьте HTTP endpoint:

```bash
curl http://localhost:8080/health
```

Ожидаемый ответ:

```json
{"status":"ok"}
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
