-- Migration 002: Normalize legacy data from the pre-split TypeScript era
--
-- When aionui-backend.db is created by copying the Electron-managed aionui.db,
-- the data still uses the old formats (camelCase JSON keys, array model fields,
-- empty acp_session table). This migration brings all legacy data to the format
-- expected by the Rust backend.
--
-- Safe to run on fresh databases (all statements are conditional / idempotent).

------------------------------------------------------------------------
-- Part A: Normalize conversations.extra JSON keys (camelCase → snake_case)
--
-- NOTE: Missing columns (pinned, pinned_at, agents_version, etc.) are
-- handled by ensure_schema_columns() in database.rs which runs before
-- migrations. This migration only performs data transformations.
------------------------------------------------------------------------

UPDATE conversations
SET extra = json_set(json_remove(extra, '$.agentName'), '$.agent_name', json_extract(extra, '$.agentName'))
WHERE json_extract(extra, '$.agentName') IS NOT NULL
  AND json_extract(extra, '$.agent_name') IS NULL;

UPDATE conversations
SET extra = json_set(json_remove(extra, '$.cliPath'), '$.cli_path', json_extract(extra, '$.cliPath'))
WHERE json_extract(extra, '$.cliPath') IS NOT NULL
  AND json_extract(extra, '$.cli_path') IS NULL;

UPDATE conversations
SET extra = json_set(json_remove(extra, '$.currentModelId'), '$.current_model_id', json_extract(extra, '$.currentModelId'))
WHERE json_extract(extra, '$.currentModelId') IS NOT NULL
  AND json_extract(extra, '$.current_model_id') IS NULL;

UPDATE conversations
SET extra = json_set(json_remove(extra, '$.sessionMode'), '$.session_mode', json_extract(extra, '$.sessionMode'))
WHERE json_extract(extra, '$.sessionMode') IS NOT NULL
  AND json_extract(extra, '$.session_mode') IS NULL;

UPDATE conversations
SET extra = json_set(json_remove(extra, '$.customWorkspace'), '$.custom_workspace', json_extract(extra, '$.customWorkspace'))
WHERE json_extract(extra, '$.customWorkspace') IS NOT NULL
  AND json_extract(extra, '$.custom_workspace') IS NULL;

UPDATE conversations
SET extra = json_set(json_remove(extra, '$.defaultFiles'), '$.default_files', json_extract(extra, '$.defaultFiles'))
WHERE json_extract(extra, '$.defaultFiles') IS NOT NULL
  AND json_extract(extra, '$.default_files') IS NULL;

UPDATE conversations
SET extra = json_set(json_remove(extra, '$.acpSessionConversationId'), '$.acp_session_conversation_id', json_extract(extra, '$.acpSessionConversationId'))
WHERE json_extract(extra, '$.acpSessionConversationId') IS NOT NULL;

UPDATE conversations
SET extra = json_set(json_remove(extra, '$.acpSessionId'), '$.acp_session_id', json_extract(extra, '$.acpSessionId'))
WHERE json_extract(extra, '$.acpSessionId') IS NOT NULL;

UPDATE conversations
SET extra = json_set(json_remove(extra, '$.acpSessionUpdatedAt'), '$.acp_session_updated_at', json_extract(extra, '$.acpSessionUpdatedAt'))
WHERE json_extract(extra, '$.acpSessionUpdatedAt') IS NOT NULL;

UPDATE conversations
SET extra = json_set(extra, '$.team_id', json_extract(extra, '$.teamId'))
WHERE json_extract(extra, '$.teamId') IS NOT NULL
  AND json_extract(extra, '$.team_id') IS NULL;

UPDATE conversations
SET extra = json_set(json_remove(extra, '$.customAgentId'), '$.custom_agent_id', json_extract(extra, '$.customAgentId'))
WHERE json_extract(extra, '$.customAgentId') IS NOT NULL
  AND json_extract(extra, '$.custom_agent_id') IS NULL;

-- Clean up stale runtime caches
UPDATE conversations
SET extra = json_remove(extra, '$.cachedConfigOptions', '$.loadedSkills', '$.lastContextLimit', '$.lastTokenUsage')
WHERE json_extract(extra, '$.cachedConfigOptions') IS NOT NULL
   OR json_extract(extra, '$.loadedSkills') IS NOT NULL;

-- Rename legacy teamMcpStdioConfig → legacy_team_mcp_stdio_config
UPDATE conversations
SET extra = json_set(
    json_remove(extra, '$.teamMcpStdioConfig'),
    '$.legacy_team_mcp_stdio_config', json_extract(extra, '$.teamMcpStdioConfig')
)
WHERE json_extract(extra, '$.teamMcpStdioConfig') IS NOT NULL
  AND json_extract(extra, '$.legacy_team_mcp_stdio_config') IS NULL;

------------------------------------------------------------------------
-- Part B: Normalize conversations.model from legacy provider format
--
-- Legacy: {"id":"xxx", "model":["gpt-5.2","gpt-4o"], "useModel":"gpt-5.2", ...}
-- Target: {"provider_id":"xxx", "model":"gpt-5.2", "use_model":null}
------------------------------------------------------------------------

UPDATE conversations
SET model = json_object(
    'provider_id', json_extract(model, '$.id'),
    'model',       json_extract(model, '$.useModel'),
    'use_model',   NULL
)
WHERE model IS NOT NULL
  AND json_valid(model)
  AND json_type(model, '$.model') = 'array'
  AND json_extract(model, '$.useModel') IS NOT NULL;

------------------------------------------------------------------------
-- Part C: Normalize teams.agents JSON (camelCase → snake_case)
--
-- Only runs on teams with agents_version = '1.0.0' (pre-normalization).
-- After conversion sets agents_version = '1.0.1'.
------------------------------------------------------------------------

UPDATE teams
SET agents = (
    SELECT json_group_array(
        json_object(
            'slot_id',           json_extract(value, '$.slotId'),
            'name',              COALESCE(json_extract(value, '$.agentName'), json_extract(value, '$.name'), ''),
            'role',              CASE
                                   WHEN COALESCE(json_extract(value, '$.role'), '') IN ('lead', 'leader') THEN 'lead'
                                   ELSE 'teammate'
                                 END,
            'conversation_id',   COALESCE(json_extract(value, '$.conversationId'), json_extract(value, '$.conversation_id'), ''),
            'backend',           COALESCE(json_extract(value, '$.agentType'), json_extract(value, '$.backend'), ''),
            'model',             COALESCE(json_extract(value, '$.model'), ''),
            'status',            COALESCE(json_extract(value, '$.status'), 'pending'),
            'conversation_type', COALESCE(json_extract(value, '$.conversationType'), json_extract(value, '$.conversation_type'), ''),
            'cli_path',          json_extract(value, '$.cliPath'),
            'custom_agent_id',   json_extract(value, '$.customAgentId')
        )
    )
    FROM json_each(teams.agents)
),
agents_version = '1.0.1'
WHERE agents_version = '1.0.0'
  AND json_valid(agents)
  AND json_array_length(agents) > 0
  AND json_extract(agents, '$[0].slotId') IS NOT NULL;

-- Teams with empty agents arrays also get marked as normalized
UPDATE teams
SET agents_version = '1.0.1'
WHERE agents_version = '1.0.0'
  AND (agents = '[]' OR json_array_length(agents) = 0);

------------------------------------------------------------------------
-- Part D: Rebuild tables to match 001 target schema
--
-- CREATE TABLE IF NOT EXISTS is a no-op for existing tables, so a v26
-- database copied from aionui.db retains its original DDL (CHECK
-- constraints, FK constraints, NOT NULL differences, DEFAULT differences).
-- This part rebuilds every affected table to guarantee schema parity
-- between fresh installs and legacy upgrades.
--
-- Safe on fresh databases: tables are empty, so the rebuild is a no-op
-- data-wise (just recreates the same structure).
--
-- REQUIRES: foreign_keys = OFF on the connection before this migration
-- runs (handled by run_migrations() in database.rs). Without this,
-- DROP TABLE triggers ON DELETE CASCADE and ALTER TABLE RENAME rewrites
-- child FK references — both destroy data.
------------------------------------------------------------------------

-- D.1: messages — hidden NOT NULL DEFAULT 0

CREATE TABLE IF NOT EXISTS _messages_new (
    id              TEXT    PRIMARY KEY NOT NULL,
    conversation_id TEXT    NOT NULL,
    msg_id          TEXT,
    type            TEXT    NOT NULL,
    content         TEXT    NOT NULL DEFAULT '{}',
    position        TEXT    CHECK(position IN ('left', 'right', 'center', 'pop')),
    status          TEXT    CHECK(status IN ('finish', 'pending', 'error', 'work')),
    hidden          INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO _messages_new
    (id, conversation_id, msg_id, type, content, position, status, hidden, created_at)
SELECT
    id, conversation_id, msg_id, type,
    COALESCE(content, '{}'),
    position, status,
    COALESCE(hidden, 0),
    created_at
FROM messages;

ALTER TABLE messages RENAME TO _messages_old;
ALTER TABLE _messages_new RENAME TO messages;
DROP TABLE IF EXISTS _messages_old;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
CREATE INDEX IF NOT EXISTS idx_messages_msg_id ON messages(msg_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created_desc ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_type_created ON messages(type, created_at DESC);

-- D.2: assistant_sessions — remove agent_type CHECK constraint

CREATE TABLE IF NOT EXISTS _assistant_sessions_new (
    id              TEXT PRIMARY KEY NOT NULL,
    user_id         TEXT    NOT NULL,
    agent_type      TEXT    NOT NULL,
    conversation_id TEXT,
    workspace       TEXT,
    chat_id         TEXT,
    created_at      INTEGER NOT NULL,
    last_activity   INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES assistant_users(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO _assistant_sessions_new (id, user_id, agent_type, conversation_id, workspace, chat_id, created_at, last_activity)
    SELECT id, user_id, agent_type, conversation_id, workspace, chat_id, created_at, last_activity
    FROM assistant_sessions;

ALTER TABLE assistant_sessions RENAME TO _assistant_sessions_old;
ALTER TABLE _assistant_sessions_new RENAME TO assistant_sessions;
DROP TABLE IF EXISTS _assistant_sessions_old;

CREATE INDEX IF NOT EXISTS idx_assistant_sessions_user_id ON assistant_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_assistant_sessions_user_chat ON assistant_sessions(user_id, chat_id);

-- D.3: conversations — add NOT NULL DEFAULT on status/extra, add pinned columns

CREATE TABLE IF NOT EXISTS _conversations_new (
    id              TEXT    PRIMARY KEY NOT NULL,
    user_id         TEXT    NOT NULL,
    name            TEXT    NOT NULL,
    type            TEXT    NOT NULL,
    extra           TEXT    NOT NULL DEFAULT '{}',
    model           TEXT,
    status          TEXT    NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending', 'running', 'finished')),
    source          TEXT,
    channel_chat_id TEXT,
    pinned          INTEGER NOT NULL DEFAULT 0,
    pinned_at       INTEGER,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO _conversations_new
    (id, user_id, name, type, extra, model, status, source, channel_chat_id, pinned, pinned_at, created_at, updated_at)
SELECT
    id, user_id, name, type,
    COALESCE(extra, '{}'),
    model,
    COALESCE(status, 'pending'),
    source, channel_chat_id,
    COALESCE(pinned, 0),
    pinned_at,
    created_at, updated_at
FROM conversations;

ALTER TABLE conversations RENAME TO _conversations_old;
ALTER TABLE _conversations_new RENAME TO conversations;
DROP TABLE IF EXISTS _conversations_old;

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at);
CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type);
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source);
CREATE INDEX IF NOT EXISTS idx_conversations_source_updated ON conversations(source, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_source_chat ON conversations(source, channel_chat_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_cron_job_id ON conversations(json_extract(extra, '$.cronJobId'));

-- D.4: teams — lead_agent_id nullable (no NOT NULL), remove FK, add defaults

CREATE TABLE IF NOT EXISTS _teams_new (
    id             TEXT PRIMARY KEY NOT NULL,
    user_id        TEXT    NOT NULL DEFAULT 'system_default_user',
    name           TEXT    NOT NULL,
    workspace      TEXT    NOT NULL DEFAULT '',
    workspace_mode TEXT    NOT NULL DEFAULT 'shared',
    agents         TEXT    NOT NULL DEFAULT '[]',
    lead_agent_id  TEXT,
    session_mode   TEXT,
    agents_version TEXT    NOT NULL DEFAULT '1.0.0',
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
);

INSERT OR IGNORE INTO _teams_new
    (id, user_id, name, workspace, workspace_mode, agents, lead_agent_id, session_mode, agents_version, created_at, updated_at)
SELECT
    id, user_id, name, workspace, workspace_mode, agents,
    CASE WHEN lead_agent_id = '' THEN NULL ELSE lead_agent_id END,
    session_mode,
    COALESCE(agents_version, '1.0.0'),
    created_at, updated_at
FROM teams;

ALTER TABLE teams RENAME TO _teams_old;
ALTER TABLE _teams_new RENAME TO teams;
DROP TABLE IF EXISTS _teams_old;

CREATE INDEX IF NOT EXISTS idx_teams_user_id ON teams(user_id);
CREATE INDEX IF NOT EXISTS idx_teams_updated_at ON teams(updated_at);

-- D.5: mailbox — add CHECK on type, remove FK

CREATE TABLE IF NOT EXISTS _mailbox_new (
    id            TEXT    PRIMARY KEY NOT NULL,
    team_id       TEXT    NOT NULL,
    to_agent_id   TEXT    NOT NULL,
    from_agent_id TEXT    NOT NULL,
    type          TEXT    NOT NULL CHECK (type IN ('message', 'idle_notification', 'shutdown_request')),
    content       TEXT    NOT NULL,
    summary       TEXT,
    files         TEXT,
    read          INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
);

INSERT OR IGNORE INTO _mailbox_new
    (id, team_id, to_agent_id, from_agent_id, type, content, summary, files, read, created_at)
SELECT
    id, team_id, to_agent_id, from_agent_id,
    CASE WHEN type IN ('message', 'idle_notification', 'shutdown_request') THEN type ELSE 'message' END,
    content, summary, files, read, created_at
FROM mailbox;

ALTER TABLE mailbox RENAME TO _mailbox_old;
ALTER TABLE _mailbox_new RENAME TO mailbox;
DROP TABLE IF EXISTS _mailbox_old;

CREATE INDEX IF NOT EXISTS idx_mailbox_team_to_read ON mailbox(team_id, to_agent_id, read);
CREATE INDEX IF NOT EXISTS idx_mailbox_team_id ON mailbox(team_id);

-- D.6: team_tasks — add CHECK on status, metadata nullable, remove FK

CREATE TABLE IF NOT EXISTS _team_tasks_new (
    id          TEXT    PRIMARY KEY NOT NULL,
    team_id     TEXT    NOT NULL,
    subject     TEXT    NOT NULL,
    description TEXT,
    status      TEXT    NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'in_progress', 'completed', 'deleted')),
    owner       TEXT,
    blocked_by  TEXT    NOT NULL DEFAULT '[]',
    blocks      TEXT    NOT NULL DEFAULT '[]',
    metadata    TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

INSERT OR IGNORE INTO _team_tasks_new
    (id, team_id, subject, description, status, owner, blocked_by, blocks, metadata, created_at, updated_at)
SELECT
    id, team_id, subject, description,
    CASE WHEN status IN ('pending', 'in_progress', 'completed', 'deleted') THEN status ELSE 'pending' END,
    owner, blocked_by, blocks,
    CASE WHEN metadata = '{}' THEN NULL ELSE metadata END,
    created_at, updated_at
FROM team_tasks;

ALTER TABLE team_tasks RENAME TO _team_tasks_old;
ALTER TABLE _team_tasks_new RENAME TO team_tasks;
DROP TABLE IF EXISTS _team_tasks_old;

CREATE INDEX IF NOT EXISTS idx_team_tasks_team_id ON team_tasks(team_id);

-- D.7: assistant_plugins — remove status CHECK constraint

CREATE TABLE IF NOT EXISTS _assistant_plugins_new (
    id             TEXT PRIMARY KEY NOT NULL,
    type           TEXT    NOT NULL,
    name           TEXT    NOT NULL,
    enabled        INTEGER NOT NULL DEFAULT 0,
    config         TEXT    NOT NULL,
    status         TEXT,
    last_connected INTEGER,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
);

INSERT OR IGNORE INTO _assistant_plugins_new
    (id, type, name, enabled, config, status, last_connected, created_at, updated_at)
SELECT id, type, name, enabled, config, status, last_connected, created_at, updated_at
FROM assistant_plugins;

ALTER TABLE assistant_plugins RENAME TO _assistant_plugins_old;
ALTER TABLE _assistant_plugins_new RENAME TO assistant_plugins;
DROP TABLE IF EXISTS _assistant_plugins_old;

-- D.8: remote_agents — status/allow_insecure NOT NULL

CREATE TABLE IF NOT EXISTS _remote_agents_new (
    id                 TEXT PRIMARY KEY NOT NULL,
    name               TEXT    NOT NULL,
    protocol           TEXT    NOT NULL,
    url                TEXT    NOT NULL,
    auth_type          TEXT    NOT NULL,
    auth_token         TEXT,
    allow_insecure     INTEGER NOT NULL DEFAULT 0,
    avatar             TEXT,
    description        TEXT,
    device_id          TEXT,
    device_public_key  TEXT,
    device_private_key TEXT,
    device_token       TEXT,
    status             TEXT    NOT NULL DEFAULT 'unknown',
    last_connected_at  INTEGER,
    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL
);

INSERT OR IGNORE INTO _remote_agents_new
    (id, name, protocol, url, auth_type, auth_token, allow_insecure, avatar, description,
     device_id, device_public_key, device_private_key, device_token, status, last_connected_at,
     created_at, updated_at)
SELECT
    id, name, protocol, url, auth_type, auth_token,
    COALESCE(allow_insecure, 0),
    avatar, description,
    device_id, device_public_key, device_private_key, device_token,
    COALESCE(status, 'unknown'),
    last_connected_at, created_at, updated_at
FROM remote_agents;

ALTER TABLE remote_agents RENAME TO _remote_agents_old;
ALTER TABLE _remote_agents_new RENAME TO remote_agents;
DROP TABLE IF EXISTS _remote_agents_old;

CREATE INDEX IF NOT EXISTS idx_remote_agents_status ON remote_agents(status);

-- D.9: cron_jobs — execution_mode NOT NULL+CHECK, schedule_description nullable,
--                  enabled NOT NULL

CREATE TABLE IF NOT EXISTS _cron_jobs_new (
    id                   TEXT    PRIMARY KEY NOT NULL,
    name                 TEXT    NOT NULL,
    enabled              INTEGER NOT NULL DEFAULT 1,
    schedule_kind        TEXT    NOT NULL CHECK(schedule_kind IN ('at', 'every', 'cron')),
    schedule_value       TEXT    NOT NULL,
    schedule_tz          TEXT,
    schedule_description TEXT,
    payload_message      TEXT    NOT NULL,
    execution_mode       TEXT    NOT NULL DEFAULT 'existing'
                                 CHECK(execution_mode IN ('existing', 'new_conversation')),
    agent_config         TEXT,
    conversation_id      TEXT    NOT NULL,
    conversation_title   TEXT,
    agent_type           TEXT    NOT NULL,
    created_by           TEXT    NOT NULL CHECK(created_by IN ('user', 'agent')),
    skill_content        TEXT,
    description          TEXT,
    created_at           INTEGER NOT NULL,
    updated_at           INTEGER NOT NULL,
    next_run_at          INTEGER,
    last_run_at          INTEGER,
    last_status          TEXT    CHECK(last_status IN ('ok', 'error', 'skipped', 'missed')),
    last_error           TEXT,
    run_count            INTEGER NOT NULL DEFAULT 0,
    retry_count          INTEGER NOT NULL DEFAULT 0,
    max_retries          INTEGER NOT NULL DEFAULT 3
);

INSERT OR IGNORE INTO _cron_jobs_new
    (id, name, enabled, schedule_kind, schedule_value, schedule_tz, schedule_description,
     payload_message, execution_mode, agent_config, conversation_id, conversation_title,
     agent_type, created_by, skill_content, description, created_at, updated_at,
     next_run_at, last_run_at, last_status, last_error, run_count, retry_count, max_retries)
SELECT
    id, name,
    COALESCE(enabled, 1),
    schedule_kind, schedule_value, schedule_tz, schedule_description,
    payload_message,
    COALESCE(execution_mode, 'existing'),
    agent_config, conversation_id, conversation_title,
    agent_type, created_by, skill_content, description, created_at, updated_at,
    next_run_at, last_run_at, last_status, last_error,
    COALESCE(run_count, 0),
    COALESCE(retry_count, 0),
    COALESCE(max_retries, 3)
FROM cron_jobs;

ALTER TABLE cron_jobs RENAME TO _cron_jobs_old;
ALTER TABLE _cron_jobs_new RENAME TO cron_jobs;
DROP TABLE IF EXISTS _cron_jobs_old;

CREATE INDEX IF NOT EXISTS idx_cron_jobs_conversation ON cron_jobs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run ON cron_jobs(next_run_at) WHERE enabled = 1;
CREATE INDEX IF NOT EXISTS idx_cron_jobs_agent_type ON cron_jobs(agent_type);

------------------------------------------------------------------------
-- Part E: Backfill acp_session rows from conversations.extra
------------------------------------------------------------------------

INSERT OR IGNORE INTO acp_session (
    conversation_id,
    agent_backend,
    agent_source,
    agent_id,
    session_id,
    session_status,
    session_config
)
SELECT
    c.id,
    COALESCE(json_extract(c.extra, '$.backend'), ''),
    'builtin',
    '',
    json_extract(c.extra, '$.acp_session_id'),
    'idle',
    '{}'
FROM conversations c
WHERE c.type = 'acp'
  AND json_extract(c.extra, '$.acp_session_id') IS NOT NULL
  AND c.id NOT IN (SELECT conversation_id FROM acp_session);
