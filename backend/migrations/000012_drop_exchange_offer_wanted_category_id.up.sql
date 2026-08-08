-- Категория желания теперь только текстовое поле exchange_offers.wanted_category.
ALTER TABLE exchange_offers DROP COLUMN IF EXISTS wanted_category_id;
