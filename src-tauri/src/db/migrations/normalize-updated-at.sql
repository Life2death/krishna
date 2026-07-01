-- Migration 16: Normalize updated_at to INTEGER epoch-ms for sync correctness
-- Problem: voiceprint_samples, voiceprint_state, and system_prompts store
-- timestamp columns as TEXT (ISO strings or epoch-ms numeric strings), causing
-- SQLite type-affinity issues with the sync engine's WHERE updated_at > ?
-- (number bind vs TEXT column).
--
-- CASE WHEN handles both ISO text (LIKE '____-__-__ %') and epoch-ms numeric
-- strings (direct CAST). strftime('%s', iso) returns seconds since epoch;
-- *1000 converts to ms. Direct CAST works for numeric strings.

-- 1. voiceprint_samples: recreate with INTEGER timestamps
CREATE TABLE IF NOT EXISTS voiceprint_samples_new (
  id TEXT PRIMARY KEY,
  speaker TEXT NOT NULL DEFAULT 'primary',
  embedding TEXT NOT NULL,
  dims INTEGER NOT NULL,
  quality REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO voiceprint_samples_new
SELECT id, speaker, embedding, dims, quality,
  CASE WHEN created_at LIKE '____-__-__ %' THEN CAST(strftime('%s', created_at) AS INTEGER) * 1000 ELSE CAST(created_at AS INTEGER) END,
  CASE WHEN updated_at LIKE '____-__-__ %' THEN CAST(strftime('%s', updated_at) AS INTEGER) * 1000 ELSE CAST(updated_at AS INTEGER) END
FROM voiceprint_samples;
DROP TABLE voiceprint_samples;
ALTER TABLE voiceprint_samples_new RENAME TO voiceprint_samples;

-- 2. voiceprint_state: recreate with INTEGER timestamps
CREATE TABLE IF NOT EXISTS voiceprint_state_new (
  speaker TEXT PRIMARY KEY DEFAULT 'primary',
  sample_count INTEGER NOT NULL DEFAULT 0,
  mature INTEGER NOT NULL DEFAULT 0,
  adaptive_threshold REAL,
  threshold_confidence REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO voiceprint_state_new
SELECT speaker, sample_count, mature, adaptive_threshold, threshold_confidence,
  CASE WHEN created_at LIKE '____-__-__ %' THEN CAST(strftime('%s', created_at) AS INTEGER) * 1000 ELSE CAST(created_at AS INTEGER) END,
  CASE WHEN updated_at LIKE '____-__-__ %' THEN CAST(strftime('%s', updated_at) AS INTEGER) * 1000 ELSE CAST(updated_at AS INTEGER) END
FROM voiceprint_state;
DROP TABLE voiceprint_state;
ALTER TABLE voiceprint_state_new RENAME TO voiceprint_state;

-- 3. system_prompts: recreate with INTEGER timestamps
CREATE TABLE IF NOT EXISTS system_prompts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO system_prompts_new
SELECT id, name, prompt,
  CASE WHEN created_at LIKE '____-__-__ %' THEN CAST(strftime('%s', created_at) AS INTEGER) * 1000 ELSE CAST(created_at AS INTEGER) END,
  CASE WHEN updated_at LIKE '____-__-__ %' THEN CAST(strftime('%s', updated_at) AS INTEGER) * 1000 ELSE CAST(updated_at AS INTEGER) END
FROM system_prompts;
DROP TABLE system_prompts;
ALTER TABLE system_prompts_new RENAME TO system_prompts;
CREATE INDEX IF NOT EXISTS idx_system_prompts_name ON system_prompts(name);
