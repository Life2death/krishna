-- Migration 19: Recruiter Radar state — seen message ids + last-check timestamp
-- See GMAIL_RECRUITER_RADAR_PLAN.md §"State"
CREATE TABLE IF NOT EXISTS recruiter_seen (
  message_id TEXT PRIMARY KEY,
  first_seen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS recruiter_radar_state (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
