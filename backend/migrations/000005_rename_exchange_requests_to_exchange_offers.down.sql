ALTER INDEX idx_eo_user RENAME TO idx_er_user;
ALTER INDEX idx_eo_offer RENAME TO idx_er_offer;
ALTER INDEX idx_eo_want_embedding RENAME TO idx_er_want_embedding;

ALTER TABLE exchange_offers RENAME TO exchange_requests;
