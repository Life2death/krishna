import { getDatabase } from "./driver";
import { redactText } from "../redact";

export type CommandOutcome = "pending" | "answered" | "failed" | "declined" | "ignored";

export type FailureReason =
  | "stt_failed" | "no_stt_provider" | "no_ai_provider" | "ai_error"
  | "plan_failed" | "tool_failed" | "wake_word_missed" | "user_declined" | "unknown";

export interface CommandLogEntry {
  id: string;
  transcript: string;
  outcome: CommandOutcome;
  failureReason?: FailureReason | null;
  detail?: string | null;
  response?: string | null;
  source?: "voice" | "text" | "mobile";
  createdAt: number;
}

interface DbCommandLog {
  id: string;
  transcript: string;
  outcome: string;
  failure_reason: string | null;
  detail: string | null;
  response: string | null;
  source: string;
  created_at: number;
}

const redact = (s?: string | null) => (s ? redactText(s).text : null);

export async function logCommand(e: CommandLogEntry): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO command_log (id, transcript, outcome, failure_reason, detail, response, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      e.id,
      redact(e.transcript) ?? "",
      e.outcome,
      e.failureReason ?? null,
      redact(e.detail),
      e.response ? redact(e.response)!.slice(0, 500) : null,
      e.source ?? "voice",
      e.createdAt,
    ]
  );
}

export async function insertPendingCommand(e: {
  id: string;
  transcript: string;
  source: "voice" | "text" | "mobile";
  createdAt: number;
}): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO command_log (id, transcript, outcome, failure_reason, detail, response, source, created_at)
     VALUES (?, ?, 'pending', NULL, NULL, NULL, ?, ?)`,
    [e.id, redact(e.transcript) ?? "", e.source ?? "voice", e.createdAt]
  );
}

export async function updateCommandOutcome(e: {
  id: string;
  outcome: CommandOutcome;
  failureReason?: FailureReason | null;
  detail?: string | null;
  response?: string | null;
}): Promise<void> {
  const db = await getDatabase();
  const result = await db.execute(
    `UPDATE command_log SET outcome=?, failure_reason=?, detail=?, response=? WHERE id=?`,
    [
      e.outcome,
      e.failureReason ?? null,
      redact(e.detail),
      e.response ? redact(e.response)!.slice(0, 500) : null,
      e.id,
    ]
  );
  // Upsert fallback: if no row was updated (e.g. non-voice/edge path), INSERT so nothing is lost.
  if (result.rowsAffected === 0) {
    await db.execute(
      `INSERT INTO command_log (id, transcript, outcome, failure_reason, detail, response, source, created_at)
       VALUES (?, 'unknown', ?, ?, ?, ?, 'voice', ?)`,
      [
        e.id,
        e.outcome,
        e.failureReason ?? null,
        redact(e.detail),
        e.response ? redact(e.response)!.slice(0, 500) : null,
        Date.now(),
      ]
    );
  }
}

export async function getCommandStats(): Promise<{
  total: number;
  answered: number;
  failed: number;
  declined: number;
  pending: number;
  byReason: { reason: FailureReason; count: number }[];
}> {
  const db = await getDatabase();
  const outcomeRows = await db.select<{ outcome: string; count: number }[]>(
    "SELECT outcome, COUNT(*) as count FROM command_log GROUP BY outcome"
  );
  const reasonRows = await db.select<{ failure_reason: string; count: number }[]>(
    "SELECT failure_reason, COUNT(*) as count FROM command_log WHERE outcome = 'failed' AND failure_reason IS NOT NULL GROUP BY failure_reason ORDER BY count DESC"
  );

  const total = outcomeRows
    .filter((r) => r.outcome !== "ignored" && r.outcome !== "pending")
    .reduce((sum, r) => sum + r.count, 0);
  const answered = outcomeRows.find((r) => r.outcome === "answered")?.count ?? 0;
  const failed = outcomeRows.find((r) => r.outcome === "failed")?.count ?? 0;
  const declined = outcomeRows.find((r) => r.outcome === "declined")?.count ?? 0;
  const pending = outcomeRows.find((r) => r.outcome === "pending")?.count ?? 0;

  return {
    total,
    answered,
    failed,
    declined,
    pending,
    byReason: reasonRows.map((r) => ({
      reason: r.failure_reason as FailureReason,
      count: r.count,
    })),
  };
}

export async function getRecentCommands(opts?: {
  outcome?: CommandOutcome;
  limit?: number;
}): Promise<CommandLogEntry[]> {
  const db = await getDatabase();
  let sql = "SELECT * FROM command_log";
  const params: unknown[] = [];
  if (opts?.outcome) {
    sql += " WHERE outcome = ?";
    params.push(opts.outcome);
  }
  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(opts?.limit ?? 100);

  const rows = await db.select<DbCommandLog[]>(sql, params);
  return rows.map((r) => ({
    id: r.id,
    transcript: r.transcript,
    outcome: r.outcome as CommandOutcome,
    failureReason: r.failure_reason as FailureReason | null,
    detail: r.detail,
    response: r.response,
    source: r.source as "voice" | "text" | "mobile",
    createdAt: r.created_at,
  }));
}

export async function getRecentActivity(opts?: {
  limit?: number;
}): Promise<CommandLogEntry[]> {
  const db = await getDatabase();
  const rows = await db.select<DbCommandLog[]>(
    "SELECT * FROM command_log ORDER BY created_at DESC LIMIT ?",
    [opts?.limit ?? 50]
  );
  return rows.map((r) => ({
    id: r.id,
    transcript: r.transcript,
    outcome: r.outcome as CommandOutcome,
    failureReason: r.failure_reason as FailureReason | null,
    detail: r.detail,
    response: r.response,
    source: r.source as "voice" | "text" | "mobile",
    createdAt: r.created_at,
  }));
}

export async function deleteAllCommandLog(): Promise<void> {
  const db = await getDatabase();
  await db.execute("DELETE FROM command_log");
}
