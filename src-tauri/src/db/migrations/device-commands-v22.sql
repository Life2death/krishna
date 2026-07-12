-- Migration 22: Cross-device command relay (desktop <-> mobile bridge P1)
-- A synced table: either device inserts a command targeted at the other kind;
-- the target's dispatcher executes it via its own processCommand and writes
-- the result back. Synced through the normal Turso sync engine (SYNC_TABLES).
CREATE TABLE IF NOT EXISTS device_commands (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('desktop', 'mobile')),
  target_kind TEXT NOT NULL CHECK(target_kind IN ('desktop', 'mobile')),
  command_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'done', 'failed')),
  result TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_device_commands_target_status
  ON device_commands(target_kind, status);
