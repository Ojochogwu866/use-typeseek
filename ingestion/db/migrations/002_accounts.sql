-- Accounts: saved fonts, trails and preferences. Additive only; every row belongs to a user and goes when the user is deleted.

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
