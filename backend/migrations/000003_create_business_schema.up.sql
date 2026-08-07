-- Основная бизнес-схема проекта: категории, вещи, заявки на обмен,
-- кластеризация заявок и цепочки обменов.

CREATE TABLE categories (
    id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE items (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_user_id UUID NOT NULL REFERENCES users(id),
    title         VARCHAR(200) NOT NULL,
    description   TEXT,
    category_id   BIGINT REFERENCES categories(id),
    embedding     VECTOR(384),
    status        VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE', 'UNAVAILABLE', 'ARCHIVED')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE exchange_requests (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id            UUID NOT NULL REFERENCES users(id),
    offered_item_id    BIGINT NOT NULL REFERENCES items(id),
    wanted_description TEXT,
    wanted_category_id BIGINT REFERENCES categories(id),
    want_embedding     VECTOR(384),
    status             VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                       CHECK (status IN ('ACTIVE', 'IN_PROPOSAL', 'LOCKED', 'DONE',
                                         'IN_PROGRESS', 'REMOVED')),
    version            BIGINT NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE clusters (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    centroid_embedding VECTOR(384),
    epsilon            NUMERIC,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cluster_members (
    cluster_id BIGINT NOT NULL REFERENCES clusters(id),
    request_id BIGINT NOT NULL REFERENCES exchange_requests(id),
    PRIMARY KEY (cluster_id, request_id)
);

CREATE TABLE chains (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    status             VARCHAR(20) NOT NULL DEFAULT 'CANDIDATE'
                       CHECK (status IN ('CANDIDATE', 'PROPOSED', 'FROZEN',
                                         'IN_PROGRESS', 'COMPLETED', 'BROKEN')),
    score              NUMERIC,
    length             INT,
    freeze_deadline_at TIMESTAMPTZ,
    invalid_reason     VARCHAR(100),
    version            BIGINT NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chain_participants (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cluster_id BIGINT REFERENCES clusters(id),
    chain_id   BIGINT NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
    request_id BIGINT NOT NULL REFERENCES exchange_requests(id),
    position   INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (chain_id, request_id),
    UNIQUE (chain_id, position)
);

CREATE TABLE votes (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chain_id   BIGINT NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
    request_id BIGINT NOT NULL REFERENCES exchange_requests(id) ON DELETE CASCADE,
    vote       VARCHAR(10) NOT NULL DEFAULT 'pending'
               CHECK (vote IN ('pending', 'approved', 'rejected')),
    voted_at   TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (chain_id, request_id)
);

CREATE INDEX idx_items_owner       ON items(owner_user_id);
CREATE INDEX idx_items_embedding   ON items USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_er_user           ON exchange_requests(user_id);
CREATE INDEX idx_er_offer          ON exchange_requests(offered_item_id);
CREATE INDEX idx_er_want_embedding ON exchange_requests USING hnsw (want_embedding vector_cosine_ops);
CREATE INDEX idx_cm_request        ON cluster_members(request_id);
CREATE INDEX idx_cp_request        ON chain_participants(request_id);
CREATE INDEX idx_votes_request     ON votes(request_id);
