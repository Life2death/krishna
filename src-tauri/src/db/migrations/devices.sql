CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'unknown',
  last_seen INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  brain_url TEXT,
  app_version TEXT
);

CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
