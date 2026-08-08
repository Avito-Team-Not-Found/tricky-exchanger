# План внедрения категорий товаров

Ветка: `feat/SCRUM-50-api-migration` (в неё смёржен `origin/main` до `d7de8ff`).
Дата: 2026-08-08.

## Статус

Реализовано: справочник-константа (4 значения), модели, **обязательный** выбор категории
в форме товара и категории желаемого в форме заявки, категория на карточке товара,
тесты и документация (шаги 1–3, 5–8 из §6).

Не сделано осознанно:

- **шаг 4** — подтверждение при смене непустой категории у существующего товара. Отложено:
  модалка требует отдельного UX-решения. После того как поле стало обязательным, сценарий
  перестал быть редким: у всех товаров, созданных до миграции, категория пустая, и первое
  же редактирование потребует её выбрать (§3, п.2);
- **экран цепочки** — заблокирован бэкендом, см. §7.

Решение по справочнику подтверждено заказчиком: отдельных словарей категорий не будет,
категория остаётся текстовым полем товара и заявки.

## 1. Что реально приехало с main

Отдельных ручек для категорий **не появилось**. В `main` пришли два коммита
(`ff69914`, `2791ba8`), которые убрали числовой `category_id` и заменили его
**текстовым полем**:

| Ресурс                          | Поле в JSON      | Тип                                        | Обязательность                    |
| ------------------------------- | ---------------- | ------------------------------------------ | --------------------------------- |
| `POST/PATCH/GET /items`         | `category`       | `string` (в PATCH — nullable-опциональное) | необязательное, по умолчанию `""` |
| `POST/PUT/GET /exchange-offers` | `wantedCategory` | `string`                                   | необязательное, по умолчанию `""` |

Опорные точки:

- `backend/internal/handler/item/handler.go:32` (create), `:38` (update), `:47` (response);
- `backend/internal/handler/exchange_offer/handler.go:30` (create/update), `:38` (response);
- `backend/internal/entity/item.go` — `Category string`, `backend/internal/entity/exchange_offer.go` — `WantedCategory string`;
- миграции `000009`–`000012`: добавлены `items.category VARCHAR(100)` и
  `exchange_offers.wanted_category VARCHAR(100)`, удалены `category_id` / `wanted_category_id`.

Чего нет:

- **нет `GET /api/v1/categories`** — в `backend/internal/core/router/router.go` группы категорий
  не зарегистрировано, хендлера категорий в `backend/internal/handler/` не существует;
- таблица `categories` и сид из 20 названий (`backend/migrations/000004_seed_categories.up.sql`)
  в БД остались, но наружу ничем не отдаются и больше ни с чем не связаны по FK.

**Вывод:** фронт не может «просто вернуть» старый запрос справочника — его некому обслуживать.
Каталог придётся держать на фронте константой (см. §4) либо просить бэкенд поднять ручку (см. §8).

## 2. Что сейчас на фронте

Категории на фронте фактически мертвы:

- `frontend/src/entities/item/model.ts:9` — `categoryId: number | null` в `Item`,
  `:19` — `categoryId?: number | null` в `ItemPayload`; поле нигде не рендерится и не отправляется;
- в `ExchangeRequest` (`src/entities/exchangeRequest/model.ts`) категории нет вообще;
- сущность `@entities/category` (`api.ts`/`hooks.ts`/`model.ts` с `fetchCategories` → `GET /categories`)
  была удалена коммитом `824717c`; там же из `ChainItemView` вырезан блок «Характеристики»
  с единственной строкой «Категория»;
- в `ItemForm` (`src/features/items/ui/ItemForm.tsx`) поля категории нет — только «Название» и «Описание»;
- в `RequestForm` (`src/features/exchange-requests/ui/RequestForm.tsx`) в блоке
  «Что вы хотите получить?» есть только `wantedDescription`;
- `ProductCard` (`src/features/items/ui/ProductCard.tsx`) показывает фото, статус и название;
- в фикстурах тестов остался мёртвый `categoryId: null` (9 мест, см. §6, шаг 6).

То есть «после перехода с mock API категории перестали отображаться» — потому что вместе с
мок-сервером ушёл `GET /categories`, а UI, который его использовал, был удалён явно.
Восстанавливать нужно не только запрос, но и сам UI.

## 3. Ключевое ограничение: категория участвует в кластеризации

`backend/internal/repository/search/top_k.go:137`:

```sql
AND COALESCE(i.category, '') IS NOT DISTINCT FROM COALESCE($4, '')
```

Условие стоит в `FindSimilarOffers`, который вызывается только из `cluster.Synchronize`
(`backend/internal/service/cluster/service.go`). Значение `$4` — категория товара текущей
заявки (`backend/internal/repository/cluster/postgres.go:99`).

**Что это значит на самом деле.** Кластер — пул взаимозаменяемых заявок на одно звено кольца
(см. `chain-participants-are-candidate-pool`). Равенство категории решает, попадёт ли чужая
заявка в **ваш** пул, то есть будет ли она считаться эквивалентной вашей. К выбору партнёра
по обмену это отношения не имеет: партнёр стоит в соседнем звене и его категория произвольна.

Формулировки вида «товар подбирается в обмен только к товарам той же категории» — ложь,
в UI их быть не должно.

Отсюда два следствия для UI:

1. **Свободный ввод категории недопустим.** «Электроника» / «электроника» / «Электронника» —
   три разных пула. Опечатавшийся пользователь оказывается в пуле из одного себя. Значит —
   только выбор из фиксированного списка (`Select`), без `mode="tags"` и произвольного текста.
2. **Пустая категория остаётся рабочим значением на бэкенде.** `COALESCE(..., '')` означает,
   что заявки с товарами без категории кластеризуются вместе. Товары, созданные до миграции,
   имеют `category = NULL` и образуют собственный «пул без категории». Форма поле требует
   (решение заказчика), поэтому первое же редактирование такого товара заставит выбрать
   категорию и переселит его заявки в другой кластер — при живых цепочках это их порвёт.
   Смягчается предупреждением (см. §6, шаг 4), которое пока не сделано.

Дополнительно: `wantedCategory` в матчинге **не используется вообще** — по коду
`exchange_offer/service.go` она только тримится и пишется в БД, эмбеддинг желаемого
строится из одного `wantedDescription`. Это чисто отображаемое поле. Не стоит обещать
пользователю, что выбор категории желаемого на что-то влияет.

## 4. Источник справочника

Бэкенд валидации значения не делает: `strings.TrimSpace` и всё
(`item_service.go:78`, `:135`). Ограничение — только `VARCHAR(100)` на уровне БД,
превышение даст 500, а не 422. Поэтому длину режем на клиенте.

Решение: константа `ITEM_CATEGORIES` на фронте — 4 значения, заданные заказчиком:

```
Личные вещи · Для дома и дачи · Запчасти и аксессуары · Электроника
```

Сид `000004_seed_categories.up.sql` (20 названий) источником **не является**: таблица
`categories` осиротела после миграций `000010`/`000012`, наружу не отдаётся и ни на что
не влияет. Совпадать с ней не требуется.

Почему константа, а не ручка:

- ручки нет и её появление не запланировано;
- список короткий и статический, меняется релизом фронта;
- убирает лишний запрос и состояния загрузки/ошибки в двух формах.

Риск — список станет живым (редактируемым без релиза). Тогда нужна ручка, см. §8.

Значение, пришедшее с сервера и отсутствующее в константе (старые данные, ручная правка БД),
**не отбрасываем**: показываем как есть, а в `Select` добавляем его отдельной опцией, чтобы
редактирование товара не сбрасывало неизвестную категорию молча.

## 5. Объём работ

Работа только на фронте, бэкенд не трогаем.

```
src/shared/config/categories.ts        (новый) константа ITEM_CATEGORIES
src/entities/item/model.ts             categoryId → category: string
src/entities/exchangeRequest/model.ts  + wantedCategory в модели и payload'ах
src/features/items/model/useItemForm.ts     + category в values/initialValues/payload
src/features/items/ui/ItemForm.tsx          + Form.Item с Select
src/features/items/ui/ProductCard.tsx       + категория на карточке
src/features/exchange-requests/model/useRequestForm.ts  + wantedCategory
src/features/exchange-requests/ui/RequestForm.tsx       + Select в блоке «хочу получить»
src/features/exchange-requests/ui/RequestCard.tsx       (опционально) категория желаемого
src/pages/products/ProductDetail*                        (если есть показ характеристик)
+ тесты и фикстуры (9 файлов), PROJECT.md, DESIGN.md
```

## 6. Пошаговый план

### Шаг 1. Справочник категорий

Создать `src/shared/config/categories.ts`:

- `export const ITEM_CATEGORIES` — 4 значения из §4;
- `export const CATEGORY_MAX_LENGTH = 100` — под `VARCHAR(100)`;
- хелпер `categoryOptions(current?: string)` → `{ value, label }[]`, который дописывает
  `current` в начало списка, если его нет в константе (см. §4);
- в шапке файла комментарий: почему список здесь, а не с бэкенда, и почему значения нельзя
  править задним числом (кластеризация по точному строковому равенству, §3).

Экспортировать из `src/shared/config/index.ts`, если такой бочонок есть; иначе импортировать
по прямому пути в стиле остальных `@shared/*`.

### Шаг 2. Модели

`src/entities/item/model.ts`:

- `Item.categoryId: number | null` → `Item.category: string`
  (бэкенд всегда сериализует строку, `null` не приходит — `itemResponse.Category string`);
- `ItemPayload.categoryId?` → `ItemPayload.category?: string`.

`src/entities/exchangeRequest/model.ts`:

- `ExchangeRequest` + `wantedCategory: string`;
- `CreateRequestPayload` + `wantedCategory?: string`;
- `UpdateRequestPayload` + `wantedCategory?: string`.

API-слои (`entities/item/api.ts`, `entities/exchangeRequest/api.ts`) менять не нужно —
они прокидывают payload целиком.

### Шаг 3. Форма товара

`useItemForm.ts`:

- `ItemFormValues` + `category: string`;
- `initialValues` + `category: item.category` (для старых товаров придёт `''`);
- в `handleSubmit` в `payload` добавить `category: values.category` — **без `trim()` и без
  подстановки дефолта**, значение и так из фиксированного списка;
- в `canSubmit` категорию **не** добавлять: поле остаётся необязательным (§3, п.2),
  иначе старый товар нельзя будет ни сохранить, ни отредактировать без смены кластера.

`ItemForm.tsx`:

- новый `Form.Item label="Категория" name="category"` между «Название» и «Описание»
  (порядок по DESIGN.md §4.2: сначала идентификация товара, потом текст);
- `<Select allowClear showSearch placeholder="Выберите категорию" options={categoryOptions(item?.category)} />`;
- **никакого `mode="tags"`** — см. §3, п.1.

### Шаг 4. Предупреждение о смене категории при редактировании

В `useItemForm.handleSubmit` (ветка `isEdit`): если `item.category` был непустым и
`values.category !== item.category` — перед отправкой показать `modal.confirm`:
смена категории уводит товар в другой пул подбора, уже собранные цепочки с этим товаром
могут распасться. Подтверждение — только при изменении непустого значения; заполнение
пустой категории впервые подтверждения не требует.

Если это сочтут избыточным для MVP — вынести в отдельный тикет, но тогда явно записать
в PROJECT.md, что смена категории молча перестраивает матчинг.

### Шаг 5. Форма заявки

`useRequestForm.ts`:

- `RequestFormValues` + `wantedCategory: string`;
- `initialValues` в ветке `isEdit` + `wantedCategory: request.wantedCategory`;
- в обеих ветках `handleSubmit` (`updateRequest` и `createRequest`) добавить
  `wantedCategory: values.wantedCategory`;
- в `canSubmit` не добавлять — поле необязательное.

`RequestForm.tsx`: в секции «Что вы хотите получить?» перед `wantedDescription` —
`Form.Item label="Категория желаемого" name="wantedCategory"` с тем же `Select`.

Подпись поля не должна обещать влияние на подбор — `wantedCategory` в матчинге не участвует
(§3). Уместен `extra`-хинт вида «поможет другим понять, что вы ищете».

### Шаг 6. Отображение

- `ProductCard.tsx`: категория под названием, только если непустая; в `aria-label`
  добавить её после статуса, чтобы скринридер читал карточку целиком.
- `RequestCard.tsx`: категория желаемого рядом с `wantedDescription`, если непустая (опционально).
- Экран товара/детали заявки — вернуть блок «Характеристики» со строкой «Категория»,
  если такой экран есть.

### Шаг 7. Тесты и фикстуры

Заменить `categoryId: null` на `category: ''` (или осмысленное значение) в:

```
src/app/auth.e2e.test.tsx:37
src/pages/exchange-requests/ChainListPage.test.tsx:54
src/pages/exchange-requests/ExchangeRequestsPage.test.tsx:33
src/pages/products/ItemFormPage.test.tsx:28
src/pages/products/ProductsPage.test.tsx:27,35
src/features/exchange-requests/model/useRequestForm.test.tsx:57
src/features/exchange-requests/ui/RequestForm.test.tsx:47,55
```

Новые кейсы:

- `useItemForm.test.tsx` — выбранная категория уходит в payload `createItem`/`updateItem`;
  пустая категория отправляется как `''` и не блокирует сабмит;
- `ItemForm.test.tsx` — неизвестная категория с сервера присутствует в опциях и сохраняется;
- `useItemForm.test.tsx` — смена непустой категории показывает подтверждение (шаг 4);
- `useRequestForm.test.tsx` — `wantedCategory` уходит в create и update payload;
- `ProductCard` — категория не рендерится при пустом значении.

Прогнать `npm run lint && npm run test` (и `tsc`, если он отдельной командой) — смена типа
`categoryId → category` подсветит все оставшиеся места компилятором.

### Шаг 8. Документация

- `PROJECT.md:48` — карточка товара теперь показывает категорию;
- `PROJECT.md:63` — категория редактируется в форме, значение из фиксированного списка;
- `PROJECT.md:271,275` — пример JSON: `"categoryId": 4` → `"category": "Электроника"`,
  описание поля переписать;
- `PROJECT.md:548,549` — в описании сущностей `category_id` → `category`,
  `wanted_category_id` → `wanted_category`;
- `PROJECT.md` §контракт — добавить `wantedCategory` в `/exchange-offers` и зафиксировать,
  что ручки `/categories` нет, справочник — константа фронта;
- `DESIGN.md:385` — в состав полей формы товара добавить «Категория (Select)».

## 7. Что сделать нельзя (заблокировано бэкендом)

**Категория на экране цепочки** (`ChainItemView`, блок «Характеристики») —
не восстанавливается. Ответы `GET /chains/:id` и `GET /exchange-offers/:id/exchange-options`
не содержат категории: в `chainParticipantResponse` и `exchangeOptionResponse`
(`backend/internal/handler/chain/chain_handler.go:45-78`) есть только
`offeredItemTitle`, `offeredItemDescription`, `wantedDescription`, `imageUrl`, `vote`.

Достать её из кеша `['items']` тоже нельзя: `GET /items` отдаёт только товары владельца,
а в цепочке участвуют чужие. Нужен либо `category` в `chainParticipantResponse`, либо
публичная ручка товара. До этого блок «Характеристики» на экране цепочки не возвращаем.

## 8. Вопросы к бэкенду

1. Добавить `category` в `chainParticipantResponse` и `exchangeOptionResponse` —
   разблокирует §7 одной строкой в маппере.
2. Нужна ли ручка `GET /api/v1/categories`? Таблица и сид живы, но не подключены.
   Если список планируется менять без релиза фронта — ручка нужна, иначе константа
   и таблица разъедутся.
3. Валидация категории на бэкенде: сейчас принимается любая строка, а `VARCHAR(100)`
   при переполнении даст 500. Просить 422 и/или проверку по справочнику — учитывая,
   что от точного совпадения строки зависит матчинг (§3).
4. Подтвердить, что `wantedCategory` действительно не участвует в подборе и остаётся
   витринным полем — от этого зависит формулировка подписи в форме заявки (§ шаг 5).
