ALTER TABLE exchange_offers
    ADD COLUMN IF NOT EXISTS wanted_category_id BIGINT REFERENCES categories(id);
