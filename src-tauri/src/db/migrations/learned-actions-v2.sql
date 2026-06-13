-- Migration 7: Create learned_actions table for Phase 3 self-learning
CREATE TABLE IF NOT EXISTS learned_actions (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  target TEXT NOT NULL,
  input TEXT NOT NULL,
  resolved_via TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_learned_input ON learned_actions(input);
