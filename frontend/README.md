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

Пока бэкенд не готов, фронтенд работает с мок-сервером на `json-server`, повторяющим
контракты эндпоинтов из `PROJECT.md` §4 (см. `mock/server.js`).

```bash
npm run mock         # мок-API на http://localhost:4000/api/v1
```

Запускается в отдельном терминале параллельно с `npm run dev`. В `.env.development`
уже указан адрес мок-сервера; чтобы переключиться на реальный бэкенд, верните
`VITE_API_BASE_URL=http://localhost:8000`.

Демо-пользователь: `anna@example.com` / `demo1234`.

- Мок-данные лежат в `mock/db.json`, пароли демо-пользователей — в `mock/passwords.json`.
- Состояние мок-сервера (созданные товары, запросы, выбранные цепочки) сохраняется в
  `mock/db.json` между перезапусками. Сбросить — вернуть файл из git.
- Сгенерированные цепочки создаются один раз на запрос и переживают перезагрузку
  страницы (`PROJECT.md` §4.4).
- Контракты мок-API покрыты тестами `mock/server.test.ts`.

## Окружение

Скопируйте `.env.example` в `.env` при необходимости:

```bash
cp .env.example .env
```

| Переменная          | Значение по умолчанию   | Назначение                                                                        |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | `http://localhost:4000` | Базовый URL API (в dev — мок-сервер, префикс `/api/v1` добавляется автоматически) |

## Линтеры, форматирование и тесты

```bash
npm run lint          # ESLint (включая правила импортов FSD)
npm run lint:fix
npm run format        # Prettier
npm run format:check
npm run test          # Vitest
npm run typecheck     # tsc --noEmit
```
