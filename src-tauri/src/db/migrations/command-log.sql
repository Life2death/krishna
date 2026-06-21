CREATE TABLE IF NOT EXISTS command_log (
  id TEXT PRIMARY KEY,
  transcript TEXT NOT NULL,
  outcome TEXT NOT NULL,
  failure_reason TEXT,
  detail TEXT,
  response TEXT,
  source TEXT NOT NULL DEFAULT 'voice',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_command_log_outcome ON command_log(outcome);
CREATE INDEX IF NOT EXISTS idx_command_log_created ON command_log(created_at);
