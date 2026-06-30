import { getDatabase } from "./driver";

export interface VoiceprintRow {
  id: string;
  embedding: string;
  sampleCount: number;
  dims: number;
}

export async function ensureVoiceprintsTable(): Promise<void> {
  const db = getDatabase();
  await db.execute(`CREATE TABLE IF NOT EXISTS voiceprints (
    id TEXT PRIMARY KEY,
    embedding TEXT NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 0,
    dims INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  )`);
}

export async function getVoiceprint(): Promise<VoiceprintRow | null> {
  await ensureVoiceprintsTable();
  const db = getDatabase();
  const rows = await db.select<any[]>(
    "SELECT id, embedding, sample_count, dims FROM voiceprints WHERE id = 'primary'"
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id as string,
    embedding: row.embedding as string,
    sampleCount: Number(row.sample_count),
    dims: Number(row.dims),
  };
}

export async function setVoiceprint(embedding: string, sampleCount: number, dims: number): Promise<void> {
  await ensureVoiceprintsTable();
  const db = getDatabase();
  await db.execute(
    `INSERT OR REPLACE INTO voiceprints (id, embedding, sample_count, dims, updated_at)
     VALUES ('primary', ?, ?, ?, datetime('now'))`,
    [embedding, sampleCount, dims]
  );
}

export async function resetVoiceprint(): Promise<void> {
  await ensureVoiceprintsTable();
  const db = getDatabase();
  await db.execute("DELETE FROM voiceprints WHERE id = 'primary'");
}
