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

function l2Normalize(vec: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map(v => v / norm);
}

export async function addVoiceSample(vec: number[]): Promise<number> {
  const existing = await getVoiceprint();
  if (!existing) {
    await setVoiceprint(JSON.stringify(vec), 1, vec.length);
    return 1;
  }
  const currentVec = JSON.parse(existing.embedding) as number[];
  const n = existing.sampleCount;
  const avg = currentVec.map((v, i) => ((v * n) + vec[i]) / (n + 1));
  const normalized = l2Normalize(avg);
  await setVoiceprint(JSON.stringify(normalized), n + 1, normalized.length);
  return n + 1;
}

export async function resetVoiceprint(): Promise<void> {
  await ensureVoiceprintsTable();
  const db = getDatabase();
  await db.execute("DELETE FROM voiceprints WHERE id = 'primary'");
}
