import { getDatabase } from "./driver";
import { writeTombstone } from "../sync/tombstone";

export interface StateRow {
  speaker: string;
  sample_count: number;
  mature: number;
  adaptive_threshold: number | null;
  threshold_confidence: number | null;
  updated_at: number;
}

interface DbState {
  speaker: string;
  sample_count: number;
  mature: number;
  adaptive_threshold: number | null;
  threshold_confidence: number | null;
  updated_at: string;
}

function toState(row: DbState): StateRow {
  return {
    speaker: row.speaker,
    sample_count: row.sample_count,
    mature: row.mature,
    adaptive_threshold: row.adaptive_threshold,
    threshold_confidence: row.threshold_confidence,
    updated_at: Number(row.updated_at),
  };
}

export async function ensureStateTable(): Promise<void> {
  const db = getDatabase();
  await db.execute(`CREATE TABLE IF NOT EXISTS voiceprint_state (
    speaker TEXT PRIMARY KEY DEFAULT 'primary',
    sample_count INTEGER NOT NULL DEFAULT 0,
    mature INTEGER NOT NULL DEFAULT 0,
    adaptive_threshold REAL,
    threshold_confidence REAL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
}

export async function getState(speaker: string = 'primary'): Promise<StateRow | null> {
  await ensureStateTable();
  const db = getDatabase();
  const rows = await db.select<DbState[]>(
    "SELECT speaker, sample_count, mature, adaptive_threshold, threshold_confidence, updated_at FROM voiceprint_state WHERE speaker = ?",
    [speaker]
  );
  return rows.length > 0 ? toState(rows[0]) : null;
}

export async function upsertState(
  speaker: string,
  data: {
    sample_count?: number;
    mature?: number;
    adaptive_threshold?: number | null;
    threshold_confidence?: number | null;
  },
): Promise<void> {
  await ensureStateTable();
  const db = getDatabase();
  const existing = await getState(speaker);
  const now = Date.now();

  if (existing) {
    const sets: string[] = ["updated_at = ?"];
    const params: any[] = [now];
    if (data.sample_count !== undefined) { sets.push("sample_count = ?"); params.push(data.sample_count); }
    if (data.mature !== undefined) { sets.push("mature = ?"); params.push(data.mature); }
    if (data.adaptive_threshold !== undefined) { sets.push("adaptive_threshold = ?"); params.push(data.adaptive_threshold); }
    if (data.threshold_confidence !== undefined) { sets.push("threshold_confidence = ?"); params.push(data.threshold_confidence); }
    params.push(speaker);
    await db.execute(
      `UPDATE voiceprint_state SET ${sets.join(", ")} WHERE speaker = ?`,
      params
    );
  } else {
    await db.execute(
      `INSERT INTO voiceprint_state (speaker, sample_count, mature, adaptive_threshold, threshold_confidence, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        speaker,
        data.sample_count ?? 0,
        data.mature ?? 0,
        data.adaptive_threshold ?? null,
        data.threshold_confidence ?? null,
        now,
      ]
    );
  }
}

export async function resetState(speaker: string = 'primary'): Promise<void> {
  await ensureStateTable();
  const db = getDatabase();
  await writeTombstone('voiceprint_state', speaker);
  await db.execute("DELETE FROM voiceprint_state WHERE speaker = ?", [speaker]);
}
