-- Migration 15: Fix TEXT updated_at for sync correctness
-- Problem: system_prompts trigger writes ISO text (datetime('now')) which can't
-- be compared with integer watermarks. Action files write Date.now() epoch ms,
-- which SQLite stores as TEXT numeric strings. After backfill, all values are
-- epoch-ms numeric strings that parseTimestamp handles correctly.

-- 1. Drop trigger that produces ISO text timestamps
DROP TRIGGER IF EXISTS update_system_prompts_timestamp;

-- 2. Convert existing ISO text timestamps to epoch-ms numeric strings
UPDATE system_prompts SET updated_at = CAST(
  (julianday(updated_at) - 2440587.5) * 86400000 AS INTEGER
) WHERE updated_at LIKE '____-__-__ %';

-- 3. Same for voiceprints (if any ISO text values exist).
-- The legacy `voiceprints` table is created lazily by the app (ensureVoiceprintsTable),
-- so on a fresh DB (e.g. a new mobile install) it may not exist yet. Create it first so
-- this migration can't fail with "no such table: voiceprints" (the UPDATE is then a no-op).
CREATE TABLE IF NOT EXISTS voiceprints (
  id TEXT PRIMARY KEY,
  embedding TEXT NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  dims INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')) NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')) NOT NULL
);
UPDATE voiceprints SET updated_at = CAST(
  (julianday(updated_at) - 2440587.5) * 86400000 AS INTEGER
) WHERE updated_at LIKE '____-__-__ %';
