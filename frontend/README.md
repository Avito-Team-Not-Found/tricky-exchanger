# Tricky Exchanger — Frontend

Фронтенд сервиса многостороннего бартера. Техническое задание — в
[`PROJECT.md`](PROJECT.md), спецификация дизайна — в [`DESIGN.md`](DESIGN.md).

## Стек

- React + TypeScript
- Vite (сборка)
- Ant Design (UI-kit)
- Redux Toolkit + react-redux (глобальное состояние)
- TanStack Query (работа с API и кеширование)
- React Router (роутинг)
- Axios (API-клиент)
- ESLint + Prettier (линтеры и форматирование)
- Vitest + React Testing Library (тесты)

## Структура

Feature-Sliced Design. Слои (сверху вниз, импорты только вниз):

- `src/app` — провайдеры, роутинг, глобальные стили, стор.
- `src/pages` — экраны.
- `src/features` — пользовательские сценарии.
- `src/entities` — бизнес-сущности.
- `src/shared` — переиспользуемые UI-компоненты, API-клиент, утилиты, типы.

## Установка и запуск

### Весь проект через Docker (рекомендуется)

Из корня репозитория:

```bash
cp .env.example .env
docker compose up -d --build
```

UI: http://localhost:3000 (nginx проксирует `/api` и `/s3`).

### Только frontend (hot-reload)

```bash
npm install
npm run dev          # http://localhost:5173
```

Фронтенд работает с реальным Go-бэкендом: запросы с пустым `VITE_API_BASE_URL` идут relative
через Vite-proxy (`vite.config.ts`, `server.proxy`) на `http://localhost:8080` — бэкенду не нужен
CORS.

Фото товаров: бэкенд отдаёт публичный адрес (`MINIO_PUBLIC_ENDPOINT`), фронт использует `imageUrl`
из ответа как есть.

## Окружение

Скопируйте `.env.example` в `.env` при необходимости:

```bash
cp .env.example .env
```

| Переменная          | Значение по умолчанию    | Назначение                                                                                         |
| ------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | (пусто, relative `/api`) | Базовый URL API (префикс `/api/v1` добавляется автоматически). Пусто = через Vite-proxy на `:8080` |

## Линтеры, форматирование и тесты

```bash
npm run lint          # ESLint (включая правила импортов FSD)
npm run lint:fix
npm run format        # Prettier
npm run format:check
npm run test          # Vitest
npm run typecheck     # tsc --noEmit
```
