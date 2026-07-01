-- Migration 13: Add sync infrastructure for local-first delta sync
-- See LOCAL_FIRST_PHASE_2_SYNC_PLAN.md

-- 1. Create memory_embeddings table (needed locally for sync; not yet in Tauri migrations)
CREATE TABLE IF NOT EXISTS memory_embeddings (
  id TEXT PRIMARY KEY,
  memory_id TEXT,
  content TEXT NOT NULL,
  embedding TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'memory',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_memory_id ON memory_embeddings(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_source ON memory_embeddings(source);
-- Add new columns for sync (safe to run even if table already existed without them)
ALTER TABLE memory_embeddings ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memory_embeddings ADD COLUMN embedding_model_version TEXT;

-- 2. Add updated_at columns to synced tables that lack them
-- (tables that already have updated_at: conversations, system_prompts, voiceprints)
ALTER TABLE messages ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memories ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE learned_actions ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE skills ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reminders ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

-- 3. Create sync_tombstones table for delete propagation
CREATE TABLE IF NOT EXISTS sync_tombstones (
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY (table_name, row_id)
);

-- 4. Create sync_state table for per-device sync watermarks
CREATE TABLE IF NOT EXISTS sync_state (
  table_name TEXT PRIMARY KEY,
  last_pulled_at INTEGER NOT NULL DEFAULT 0,
  last_pushed_at INTEGER NOT NULL DEFAULT 0
);

-- 5. Backfill updated_at for existing rows
UPDATE messages SET updated_at = timestamp WHERE updated_at = 0;
UPDATE memories SET updated_at = created_at WHERE updated_at = 0;
UPDATE learned_actions SET updated_at = created_at WHERE updated_at = 0;
UPDATE skills SET updated_at = created_at WHERE updated_at = 0;
UPDATE reminders SET updated_at = created_at WHERE updated_at = 0;
UPDATE memory_embeddings SET updated_at = created_at WHERE updated_at = 0;
