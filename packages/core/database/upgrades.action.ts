import { getDatabase } from "./driver";
import type {
  CreateUpgradeTaskInput,
  UpdateUpgradeTaskInput,
  UpgradeEvent,
  UpgradeEventType,
  UpgradeProviderPolicy,
  UpgradeRun,
  UpgradeRunProvider,
  UpgradeRunStage,
  UpgradeRunStatus,
  UpgradeTask,
  UpgradeTaskFilters,
  UpgradeTaskStatus,
} from "../types/upgrade";
import { summarizeUpgradeTitle, validateCreateUpgradeTaskInput } from "../upgrades";

interface DbUpgradeTask {
  id: string;
  title: string;
  request_text: string;
  normalized_goal: string;
  acceptance_criteria_json: string;
  area: string;
  priority: string;
  source: string;
  origin_command_log_id: string | null;
  context_json: string;
  platform: string;
  app_version: string | null;
  status: string;
  provider_policy: string;
  latest_run_id: string | null;
  created_at: number;
  updated_at: number;
}

interface DbUpgradeRun {
  id: string;
  task_id: string;
  stage: string;
  provider: string;
  status: string;
  suggestion_summary: string | null;
  recommended_action: string | null;
  alternatives_json: string;
  risks_json: string;
  affected_files_json: string;
  test_plan_json: string;
  provider_run_id: string | null;
  github_run_id: string | null;
  branch_name: string | null;
  pr_url: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  cost_usd: number | null;
  error: string | null;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  finished_at: number | null;
}

interface DbUpgradeEvent {
  id: string;
  task_id: string;
  run_id: string | null;
  event_type: string;
  actor: string;
  note: string | null;
  created_at: number;
  updated_at: number;
}

function id(prefix: string): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function toTask(row: DbUpgradeTask): UpgradeTask {
  return {
    id: row.id,
    title: row.title,
    requestText: row.request_text,
    normalizedGoal: row.normalized_goal,
    acceptanceCriteriaJson: row.acceptance_criteria_json,
    area: row.area,
    priority: row.priority as UpgradeTask["priority"],
    source: row.source as UpgradeTask["source"],
    originCommandLogId: row.origin_command_log_id,
    contextJson: row.context_json,
    platform: row.platform as UpgradeTask["platform"],
    appVersion: row.app_version,
    status: row.status as UpgradeTaskStatus,
    providerPolicy: row.provider_policy as UpgradeProviderPolicy,
    latestRunId: row.latest_run_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRun(row: DbUpgradeRun): UpgradeRun {
  return {
    id: row.id,
    taskId: row.task_id,
    stage: row.stage as UpgradeRunStage,
    provider: row.provider as UpgradeRunProvider,
    status: row.status as UpgradeRunStatus,
    suggestionSummary: row.suggestion_summary,
    recommendedAction: row.recommended_action,
    alternativesJson: row.alternatives_json,
    risksJson: row.risks_json,
    affectedFilesJson: row.affected_files_json,
    testPlanJson: row.test_plan_json,
    providerRunId: row.provider_run_id,
    githubRunId: row.github_run_id,
    branchName: row.branch_name,
    prUrl: row.pr_url,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    costUsd: row.cost_usd,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function toEvent(row: DbUpgradeEvent): UpgradeEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    runId: row.run_id,
    eventType: row.event_type as UpgradeEventType,
    actor: row.actor as UpgradeEvent["actor"],
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createUpgradeTask(input: CreateUpgradeTaskInput): Promise<UpgradeTask> {
  validateCreateUpgradeTaskInput(input);
  const db = await getDatabase();
  const now = Date.now();
  const requestText = input.requestText.trim();
  const task: UpgradeTask = {
    id: id("upg_task"),
    title: input.title?.trim() || summarizeUpgradeTitle(requestText),
    requestText,
    normalizedGoal: input.normalizedGoal?.trim() || requestText,
    acceptanceCriteriaJson: JSON.stringify(input.acceptanceCriteria ?? []),
    area: input.area?.trim() || "Self-improvement",
    priority: input.priority ?? "normal",
    source: input.source ?? "manual",
    originCommandLogId: input.originCommandLogId ?? null,
    contextJson: JSON.stringify(input.context ?? {}),
    platform: input.platform ?? "unknown",
    appVersion: input.appVersion ?? null,
    status: "queued",
    providerPolicy: input.providerPolicy ?? "codex_plus_claude",
    latestRunId: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.execute(
    `INSERT INTO upgrade_tasks (id, title, request_text, normalized_goal, acceptance_criteria_json, area, priority, source, origin_command_log_id, context_json, platform, app_version, status, provider_policy, latest_run_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      task.id,
      task.title,
      task.requestText,
      task.normalizedGoal,
      task.acceptanceCriteriaJson,
      task.area,
      task.priority,
      task.source,
      task.originCommandLogId,
      task.contextJson,
      task.platform,
      task.appVersion,
      task.status,
      task.providerPolicy,
      task.latestRunId,
      task.createdAt,
      task.updatedAt,
    ],
  );
  await appendUpgradeEvent(task.id, "task_created", "user", "Created locally; provider execution is disabled in Stage 1.");
  return task;
}

export async function listUpgradeTasks(filters: UpgradeTaskFilters = {}): Promise<UpgradeTask[]> {
  const db = await getDatabase();
  const where: string[] = [];
  const params: unknown[] = [];
  if (!filters.includeArchived) {
    where.push("status != 'archived'");
  }
  if (filters.status && filters.status !== "all") {
    where.push("status = ?");
    params.push(filters.status);
  }
  if (filters.query?.trim()) {
    where.push("(LOWER(title) LIKE ? OR LOWER(request_text) LIKE ? OR LOWER(area) LIKE ?)");
    const q = `%${filters.query.trim().toLowerCase()}%`;
    params.push(q, q, q);
  }
  const rows = await db.select<DbUpgradeTask[]>(
    `SELECT * FROM upgrade_tasks ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY updated_at DESC`,
    params,
  );
  return rows.map(toTask);
}

export async function getUpgradeTask(idValue: string): Promise<UpgradeTask | null> {
  const db = await getDatabase();
  const rows = await db.select<DbUpgradeTask[]>("SELECT * FROM upgrade_tasks WHERE id = ?", [idValue]);
  return rows.length > 0 ? toTask(rows[0]) : null;
}

export async function updateUpgradeTask(idValue: string, input: UpdateUpgradeTaskInput): Promise<boolean> {
  const db = await getDatabase();
  const setClauses: string[] = [];
  const params: unknown[] = [];
  const map: Record<string, unknown> = {
    title: input.title,
    normalized_goal: input.normalizedGoal,
    acceptance_criteria_json: input.acceptanceCriteria ? JSON.stringify(input.acceptanceCriteria) : undefined,
    area: input.area,
    priority: input.priority,
    provider_policy: input.providerPolicy,
  };
  for (const [key, value] of Object.entries(map)) {
    if (value !== undefined) {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
  }
  if (setClauses.length === 0) return false;
  setClauses.push("updated_at = ?");
  params.push(Date.now(), idValue);
  const result = await db.execute(`UPDATE upgrade_tasks SET ${setClauses.join(", ")} WHERE id = ?`, params);
  if (result.rowsAffected > 0) {
    await appendUpgradeEvent(idValue, "task_updated", "user", "Task metadata updated locally.");
  }
  return result.rowsAffected > 0;
}

export async function archiveUpgradeTask(idValue: string): Promise<boolean> {
  const db = await getDatabase();
  const now = Date.now();
  const result = await db.execute(
    "UPDATE upgrade_tasks SET status = 'archived', updated_at = ? WHERE id = ? AND status != 'archived'",
    [now, idValue],
  );
  if (result.rowsAffected > 0) {
    await appendUpgradeEvent(idValue, "archived", "user", "Archived locally.");
  }
  return result.rowsAffected > 0;
}

export async function appendUpgradeEvent(
  taskId: string,
  eventType: UpgradeEventType,
  actor: UpgradeEvent["actor"],
  note?: string | null,
  runId?: string | null,
): Promise<UpgradeEvent> {
  const db = await getDatabase();
  const now = Date.now();
  const event: UpgradeEvent = {
    id: id("upg_event"),
    taskId,
    runId: runId ?? null,
    eventType,
    actor,
    note: note ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db.execute(
    `INSERT INTO upgrade_events (id, task_id, run_id, event_type, actor, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [event.id, event.taskId, event.runId, event.eventType, event.actor, event.note, event.createdAt, event.updatedAt],
  );
  return event;
}

export async function listUpgradeEvents(taskId: string): Promise<UpgradeEvent[]> {
  const db = await getDatabase();
  const rows = await db.select<DbUpgradeEvent[]>(
    "SELECT * FROM upgrade_events WHERE task_id = ? ORDER BY created_at ASC",
    [taskId],
  );
  return rows.map(toEvent);
}

export async function listUpgradeRuns(taskId: string): Promise<UpgradeRun[]> {
  const db = await getDatabase();
  const rows = await db.select<DbUpgradeRun[]>(
    "SELECT * FROM upgrade_runs WHERE task_id = ? ORDER BY created_at DESC",
    [taskId],
  );
  return rows.map(toRun);
}
