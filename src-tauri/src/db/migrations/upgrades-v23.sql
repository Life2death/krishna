-- Migration 23: Local self-improvement upgrade queue (Stage 1)

CREATE TABLE IF NOT EXISTS upgrade_tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  request_text TEXT NOT NULL,
  normalized_goal TEXT NOT NULL,
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  area TEXT NOT NULL DEFAULT 'Self-improvement',
  priority TEXT NOT NULL DEFAULT 'normal',
  source TEXT NOT NULL DEFAULT 'manual',
  origin_command_log_id TEXT,
  context_json TEXT NOT NULL DEFAULT '{}',
  platform TEXT NOT NULL DEFAULT 'unknown',
  app_version TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  provider_policy TEXT NOT NULL DEFAULT 'codex_plus_claude',
  latest_run_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_upgrade_tasks_status_updated ON upgrade_tasks(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_upgrade_tasks_priority_created ON upgrade_tasks(priority, created_at);

CREATE TABLE IF NOT EXISTS upgrade_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  suggestion_summary TEXT,
  recommended_action TEXT,
  alternatives_json TEXT NOT NULL DEFAULT '[]',
  risks_json TEXT NOT NULL DEFAULT '[]',
  affected_files_json TEXT NOT NULL DEFAULT '[]',
  test_plan_json TEXT NOT NULL DEFAULT '[]',
  provider_run_id TEXT,
  github_run_id TEXT,
  branch_name TEXT,
  pr_url TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost_usd REAL,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  FOREIGN KEY(task_id) REFERENCES upgrade_tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_upgrade_runs_task_created ON upgrade_runs(task_id, created_at);

CREATE TABLE IF NOT EXISTS upgrade_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  run_id TEXT,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(task_id) REFERENCES upgrade_tasks(id),
  FOREIGN KEY(run_id) REFERENCES upgrade_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_upgrade_events_task_created ON upgrade_events(task_id, created_at);
