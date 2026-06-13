CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  key TEXT,
  value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'explicit',
  confirmed INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);