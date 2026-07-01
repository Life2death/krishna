CREATE TABLE IF NOT EXISTS voiceprint_samples (
  id TEXT PRIMARY KEY,
  speaker TEXT NOT NULL DEFAULT 'primary',
  embedding TEXT NOT NULL,
  dims INTEGER NOT NULL,
  quality REAL,
  created_at TEXT DEFAULT (datetime('now')) NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')) NOT NULL
);

CREATE TABLE IF NOT EXISTS voiceprint_state (
  speaker TEXT PRIMARY KEY DEFAULT 'primary',
  sample_count INTEGER NOT NULL DEFAULT 0,
  mature INTEGER NOT NULL DEFAULT 0,
  adaptive_threshold REAL,
  threshold_confidence REAL,
  created_at TEXT DEFAULT (datetime('now')) NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')) NOT NULL
);

INSERT OR IGNORE INTO voiceprint_state (speaker) VALUES ('primary');
