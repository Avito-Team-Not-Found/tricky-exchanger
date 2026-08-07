-- +goose Up
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) users
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name     VARCHAR(100),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) categories
CREATE TABLE categories (
    id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

-- 3) items
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

-- 4) exchange_requests
CREATE TABLE exchange_requests (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id            UUID NOT NULL REFERENCES users(id),
    offered_item_id    BIGINT NOT NULL REFERENCES items(id),
    wanted_description TEXT,
    want_embedding     VECTOR(384),
    status             VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                       CHECK (status IN ('ACTIVE', 'IN_PROPOSAL', 'LOCKED', 'DONE',
                                         'IN_PROGRESS', 'REMOVED')),
    version            BIGINT NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5) clusters
CREATE TABLE clusters (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    centroid_embedding VECTOR(384),
    epsilon            NUMERIC,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6) cluster_members
CREATE TABLE cluster_members (
    cluster_id BIGINT NOT NULL REFERENCES clusters(id),
    request_id BIGINT NOT NULL REFERENCES exchange_requests(id),
    PRIMARY KEY (cluster_id, request_id)
);

-- 7) chains
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

-- 8) chain_participants
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

-- 9) votes
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

-- индексы
CREATE INDEX idx_users_email       ON users(lower(email));
CREATE INDEX idx_items_owner       ON items(owner_user_id);
CREATE INDEX idx_items_embedding   ON items USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_er_user           ON exchange_requests(user_id);
CREATE INDEX idx_er_offer          ON exchange_requests(offered_item_id);
CREATE INDEX idx_er_want_embedding ON exchange_requests USING hnsw (want_embedding vector_cosine_ops);
CREATE INDEX idx_cm_request        ON cluster_members(request_id);
CREATE INDEX idx_cp_request        ON chain_participants(request_id);
CREATE INDEX idx_votes_request     ON votes(request_id);

-- +goose Down
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS chain_participants;
DROP TABLE IF EXISTS chains;
DROP TABLE IF EXISTS cluster_members;
DROP TABLE IF EXISTS clusters;
DROP TABLE IF EXISTS exchange_requests;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;