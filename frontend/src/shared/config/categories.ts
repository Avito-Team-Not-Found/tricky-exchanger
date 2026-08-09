// Справочник категорий товара. Отдельной ручки у бэкенда нет — категория хранится
// текстом в items.category и exchange_offers.wanted_category, поэтому список опций
// живёт здесь. Сид backend/migrations/000004_seed_categories.up.sql не в счёт:
// таблица categories осиротела после миграций 000010/000012 и наружу не отдаётся.
//
// Значения — только из этого списка, свободный ввод недопустим: кластеризация заявок
// сравнивает категорию точным строковым равенством (FindSimilarOffers →
// backend/internal/repository/search/top_k.go), так что «Электроника» и «электроника»
// разведут взаимозаменяемые заявки по разным пулам кандидатов.
export const ITEM_CATEGORIES = [
  'Личные вещи',
  'Для дома и дачи',
  'Запчасти и аксессуары',
  'Электроника',
] as const;

// колонка в БД — VARCHAR(100), переполнение бэкенд не валидирует и отдаёт 500
export const CATEGORY_MAX_LENGTH = 100;

// Категория, пришедшая с сервера, может отсутствовать в справочнике (данные старше миграции
// или правка мимо UI) — дописываем её опцией, иначе редактирование товара молча сбросит
// значение, а вместе с ним и пул подбора.
export function categoryOptions(current?: string): { value: string; label: string }[] {
  const options = ITEM_CATEGORIES.map((name) => ({ value: name, label: name }));
  if (current && !ITEM_CATEGORIES.some((name) => name === current)) {
    return [{ value: current, label: current }, ...options];
  }
  return options;
}
