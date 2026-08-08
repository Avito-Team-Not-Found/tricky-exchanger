-- Текстовая категория желаемого товара в заявке (например, "Телефоны").
ALTER TABLE exchange_offers ADD COLUMN wanted_category VARCHAR(100);
