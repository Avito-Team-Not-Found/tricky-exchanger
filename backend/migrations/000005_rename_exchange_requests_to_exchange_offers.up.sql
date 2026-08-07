ALTER TABLE exchange_requests RENAME TO exchange_offers;

ALTER INDEX idx_er_user RENAME TO idx_eo_user;
ALTER INDEX idx_er_offer RENAME TO idx_eo_offer;
ALTER INDEX idx_er_want_embedding RENAME TO idx_eo_want_embedding;
