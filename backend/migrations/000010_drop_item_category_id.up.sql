-- Категория товара теперь только текстовое поле items.category.
ALTER TABLE items DROP COLUMN IF EXISTS category_id;
