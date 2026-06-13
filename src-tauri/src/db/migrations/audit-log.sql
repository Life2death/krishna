CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  result TEXT NOT NULL,
  reversible INTEGER NOT NULL DEFAULT 0,
  undo_payload TEXT,
  created_at INTEGER NOT NULL
);
