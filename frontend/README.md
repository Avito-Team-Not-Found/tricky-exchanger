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

```bash
npm install
npm run dev          # dev-сервер (Vite), по умолчанию http://localhost:5173
npm run build        # сборка (tsc + vite build)
npm run preview      # предпросмотр собранного проекта
```

## Мок-сервер

По умолчанию фронтенд работает с реальным Go-бэкендом: запросы `VITE_API_BASE_URL` (пустой) идут
relative через Vite-proxy (`vite.config.ts`, `server.proxy`) на `http://localhost:8080` — бэкенду
не нужен CORS. Мок-сервер на `json-server` (`mock/server.js`) оставлен только как инструмент
локальной разработки без поднятого бэкенда. Он **не является источником истины по контракту** —
при расхождении с `PROJECT.md` §4 правки вносятся в бэкенд, а мок при необходимости
подтягивается следом.

Фото товаров: пока бэкенд не отдаёт публичный адрес MinIO (`MINIO_PUBLIC_ENDPOINT`), `imageUrl`
содержит внутрисетевое имя `minio:9000`, недоступное браузеру. Фронт переписывает его на
`localhost:9000` через `publicImageUrl` (`src/shared/lib/imageUrl.ts`) — после бэкенд-правки
утилита станет no-op и её можно удалить.

```bash
npm run mock         # мок-API на http://localhost:4000/api/v1
```

Запускается в отдельном терминале параллельно с `npm run dev`. Чтобы работать с моком,
переключите `VITE_API_BASE_URL=http://localhost:4000` в `.env.development`.

Демо-пользователь: `anna@example.com` / `demo1234`.

- Мок-данные лежат в `mock/db.json`, пароли демо-пользователей — в `mock/passwords.json`.
- Состояние мок-сервера (созданные товары, запросы, выбранные цепочки) сохраняется в
  `mock/db.json` между перезапусками. Сбросить — вернуть файл из git.
- Сгенерированные цепочки создаются один раз на запрос и переживают перезагрузку
  страницы (`PROJECT.md` §4.4).
- Контракты мок-API покрыты тестами `mock/server.test.ts` — они тестируют мок, а не контракт.

## Окружение

Скопируйте `.env.example` в `.env` при необходимости:

```bash
cp .env.example .env
```

| Переменная          | Значение по умолчанию    | Назначение                                                                                                                             |
| ------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | (пусто, relative `/api`) | Базовый URL API (префикс `/api/v1` добавляется автоматически). Пусто = через Vite-proxy на `:8080`; для мока — `http://localhost:4000` |

## Линтеры, форматирование и тесты

```bash
npm run lint          # ESLint (включая правила импортов FSD)
npm run lint:fix
npm run format        # Prettier
npm run format:check
npm run test          # Vitest
npm run typecheck     # tsc --noEmit
```
