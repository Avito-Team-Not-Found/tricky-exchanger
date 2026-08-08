ALTER TABLE chain_participants
    DROP COLUMN IF EXISTS cluster_size,
    DROP COLUMN IF EXISTS reliability,
    DROP COLUMN IF EXISTS edge_cosine;

DROP INDEX IF EXISTS ux_exchange_offers_locked_in_proposal_item;