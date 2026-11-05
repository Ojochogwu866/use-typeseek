-- Core schema for the font ingestion index.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS fonts (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    source      TEXT NOT NULL,
    source_url  TEXT NOT NULL,
    license     TEXT,
    category    TEXT,
    cluster_id  INTEGER,
    UNIQUE (source, name)
);

CREATE TABLE IF NOT EXISTS embeddings (
    font_id INTEGER PRIMARY KEY REFERENCES fonts (id) ON DELETE CASCADE,
    vec     vector(768) NOT NULL
);

CREATE INDEX IF NOT EXISTS embeddings_vec_hnsw
    ON embeddings USING hnsw (vec vector_cosine_ops);

-- Corpus mean embedding; queries and stored vectors are centered against this before comparison.
CREATE TABLE IF NOT EXISTS embedding_center (
    vec vector(768) NOT NULL
);

-- One embedding per weight a font ships, not mean-pooled.
CREATE TABLE IF NOT EXISTS embeddings_by_weight (
    font_id INTEGER NOT NULL REFERENCES fonts (id) ON DELETE CASCADE,
    weight  TEXT NOT NULL,
    vec     vector(768) NOT NULL,
    PRIMARY KEY (font_id, weight)
);

CREATE INDEX IF NOT EXISTS embeddings_by_weight_vec_hnsw
    ON embeddings_by_weight USING hnsw (vec vector_cosine_ops);

CREATE TABLE IF NOT EXISTS descriptions (
    font_id      INTEGER PRIMARY KEY REFERENCES fonts (id) ON DELETE CASCADE,
    official_text TEXT,
    llm_tags     TEXT,
    tsv          tsvector
);

CREATE INDEX IF NOT EXISTS descriptions_tsv_idx
    ON descriptions USING gin (tsv);

CREATE TABLE IF NOT EXISTS users (
    id         SERIAL PRIMARY KEY,
    google_sub TEXT NOT NULL UNIQUE,
    email      TEXT NOT NULL,
    name       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx
    ON sessions (user_id);

CREATE TABLE IF NOT EXISTS trails (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    origin     TEXT NOT NULL,
    font_ids   INTEGER[] NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trails_user_id_idx
    ON trails (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS saved_fonts (
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    font_id    INTEGER NOT NULL REFERENCES fonts (id) ON DELETE CASCADE,
    found_with TEXT NOT NULL DEFAULT '',
    trail_id   INTEGER REFERENCES trails (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, font_id)
);

CREATE INDEX IF NOT EXISTS saved_fonts_user_created_idx
    ON saved_fonts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS preferences (
    user_id       INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    preview_words TEXT NOT NULL DEFAULT 'The Evening Edition',
    license       TEXT NOT NULL DEFAULT '',
    is_map_shown  BOOLEAN NOT NULL DEFAULT true,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
