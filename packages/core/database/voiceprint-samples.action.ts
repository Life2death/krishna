import { getDatabase } from "./driver";
import { writeTombstone, writeTombstones } from "../sync/tombstone";

export interface SampleRow {
  id: string;
  speaker: string;
  embedding: string;
  dims: number;
  quality: number | null;
  created_at: number;
}

interface DbSample {
  id: string;
  speaker: string;
  embedding: string;
  dims: number;
  quality: number | null;
  created_at: string;
}

const GALLERY_CAP = 30;

function toSample(row: DbSample): SampleRow {
  return {
    id: row.id,
    speaker: row.speaker,
    embedding: row.embedding,
    dims: row.dims,
    quality: row.quality,
    created_at: new Date(row.created_at).getTime(),
  };
}

export async function ensureSamplesTable(): Promise<void> {
  const db = getDatabase();
  await db.execute(`CREATE TABLE IF NOT EXISTS voiceprint_samples (
    id TEXT PRIMARY KEY,
    speaker TEXT NOT NULL DEFAULT 'primary',
    embedding TEXT NOT NULL,
    dims INTEGER NOT NULL,
    quality REAL,
    created_at TEXT DEFAULT (datetime('now')) NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')) NOT NULL
  )`);
}

export async function getAllSamples(speaker: string = 'primary'): Promise<SampleRow[]> {
  await ensureSamplesTable();
  const db = getDatabase();
  const rows = await db.select<DbSample[]>(
    "SELECT id, speaker, embedding, dims, quality, created_at FROM voiceprint_samples WHERE speaker = ? ORDER BY created_at ASC",
    [speaker]
  );
  return rows.map(toSample);
}

export async function getSampleById(id: string): Promise<SampleRow | null> {
  await ensureSamplesTable();
  const db = getDatabase();
  const rows = await db.select<DbSample[]>(
    "SELECT id, speaker, embedding, dims, quality, created_at FROM voiceprint_samples WHERE id = ?",
    [id]
  );
  return rows.length > 0 ? toSample(rows[0]) : null;
}

export async function addSample(
  id: string,
  speaker: string,
  embedding: string,
  dims: number,
  quality?: number,
): Promise<SampleRow> {
  await ensureSamplesTable();
  const db = getDatabase();
  const now = Date.now();
  const sample: SampleRow = { id, speaker, embedding, dims, quality: quality ?? null, created_at: now };
  await db.execute(
    `INSERT INTO voiceprint_samples (id, speaker, embedding, dims, quality, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, speaker, embedding, dims, sample.quality, now]
  );

  const all = await getAllSamples(speaker);
  if (all.length > GALLERY_CAP) {
    const evict = all[all.length - GALLERY_CAP - 1];
    await writeTombstone('voiceprint_samples', evict.id);
    await db.execute("DELETE FROM voiceprint_samples WHERE id = ?", [evict.id]);
  }

  return sample;
}

export async function deleteSample(id: string): Promise<boolean> {
  await ensureSamplesTable();
  const db = getDatabase();
  await writeTombstone('voiceprint_samples', id);
  const result = await db.execute("DELETE FROM voiceprint_samples WHERE id = ?", [id]);
  return result.rowsAffected > 0;
}

export async function evictSample(id: string): Promise<boolean> {
  return deleteSample(id);
}

export async function deleteAllSamples(speaker: string = 'primary'): Promise<boolean> {
  await ensureSamplesTable();
  const db = getDatabase();
  const rows = await db.select<{ id: string }[]>(
    "SELECT id FROM voiceprint_samples WHERE speaker = ?", [speaker]
  );
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await writeTombstones('voiceprint_samples', ids);
  }
  await db.execute("DELETE FROM voiceprint_samples WHERE speaker = ?", [speaker]);
  return true;
}

export async function getSampleCount(speaker: string = 'primary'): Promise<number> {
  await ensureSamplesTable();
  const db = getDatabase();
  const rows = await db.select<{ cnt: number }[]>(
    "SELECT COUNT(*) as cnt FROM voiceprint_samples WHERE speaker = ?", [speaker]
  );
  return rows[0]?.cnt ?? 0;
}
