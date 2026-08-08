-- Гарантия: один товар не может быть предложением более чем в одной
-- «заблокированной» заявке (IN_PROPOSAL / LOCKED). В статусе ACTIVE один и тот же
-- товар может фигурировать в нескольких заявках — доступность определяется при
-- мягкой блокировке, поэтому ACTIVE в индекс не входит.
CREATE UNIQUE INDEX ux_exchange_offers_locked_in_proposal_item
    ON exchange_offers (offered_item_id)
    WHERE status IN ('LOCKED', 'IN_PROPOSAL');

-- Персистентность сырых фич score на уровне участника: EdgeCosines, Reliability,
-- ClusterSizes больше не живут только в ChainDraft, поэтому Ranker сможет
-- пересчитать chains.score после отклика/отзыва без перебора драфтов.
ALTER TABLE chain_participants
    ADD COLUMN edge_cosine  DOUBLE PRECISION,
    ADD COLUMN reliability  DOUBLE PRECISION,
    ADD COLUMN cluster_size INT;