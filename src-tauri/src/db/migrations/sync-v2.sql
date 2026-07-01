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

-- 3. Same for voiceprints (if any ISO text values exist)
UPDATE voiceprints SET updated_at = CAST(
  (julianday(updated_at) - 2440587.5) * 86400000 AS INTEGER
) WHERE updated_at LIKE '____-__-__ %';
