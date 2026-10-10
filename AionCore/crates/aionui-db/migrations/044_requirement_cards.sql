-- User/project scoped aggregates keep the card, audit snapshots, checks and links atomic.
CREATE TABLE IF NOT EXISTS requirement_cards (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK (revision > 0),
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requirement_cards_owner_project ON requirement_cards(user_id, project_id, updated_at DESC);
