-- Migration 21: Saved searches for Naukri/LinkedIn job searches
-- See NAUKRI_SEARCH_PROFILES_PLAN.md §N1
CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role_tag TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  chrome_profile_dir TEXT NOT NULL DEFAULT '',
  chrome_profile_name TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'manual' CHECK(mode IN ('manual', 'assisted')),
  resume_path_override TEXT,
  created_at INTEGER NOT NULL
);
