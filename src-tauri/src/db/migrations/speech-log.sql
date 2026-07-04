-- Migration 18: speech_log — every spoken utterance, success or failure, for observability
-- (T4-F7). Distinct from command_log: command_log is one row per USER command; speech_log
-- is one row per SPOKEN utterance, including confirmation prompts, timeouts, declines, and
-- fillers that command_log never captures.
CREATE TABLE IF NOT EXISTS speech_log (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  source TEXT NOT NULL,
  related_command_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_speech_log_created_at ON speech_log(created_at);
