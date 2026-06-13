-- Migration 8: Create skills table for Phase 4 reusable task recipes
CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  trigger_examples TEXT NOT NULL DEFAULT '[]',
  params TEXT NOT NULL DEFAULT '[]',
  plan_template TEXT NOT NULL,
  confirmed_by_user INTEGER NOT NULL DEFAULT 0,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
