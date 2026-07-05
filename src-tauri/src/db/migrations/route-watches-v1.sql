-- Migration 20: Route watches — background route monitoring (Feature B)
-- See TRAVEL_INSIGHTS_PLAN.md §"Feature B"
CREATE TABLE IF NOT EXISTS route_watches (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'car',
  threshold_minutes INTEGER NOT NULL,
  interval_minutes INTEGER NOT NULL DEFAULT 15,
  expires_at INTEGER NOT NULL,
  last_checked_at INTEGER,
  last_duration_minutes INTEGER,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'triggered', 'expired', 'cancelled')),
  created_at INTEGER NOT NULL
);
