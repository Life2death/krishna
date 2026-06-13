-- Migration 6: Create learned_actions table for Phase 3 self-learning
CREATE TABLE IF NOT EXISTS learned_actions (
  id INTEGER PRIMARY KEY,
  phrase TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target TEXT NOT NULL,
  resolved_via TEXT NOT NULL,
  confidence REAL DEFAULT 0.5,
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  confirmed_by_user INTEGER DEFAULT 0,
  last_used_at INTEGER,
  created_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_learned_canonical ON learned_actions(canonical_name, action_type);
