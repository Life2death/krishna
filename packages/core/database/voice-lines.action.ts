import { getDatabase } from "./driver";

export type VoiceCategory =
  | "filler_wait"
  | "ack_quick"
  | "ack_multistep"
  | "confirm_yes_ack"
  | "decline_ack"
  | "reask"
  | "error_generic"
  | "error_network"
  | "reminder_intro"
  | "greeting"
  | "thanks_reply"
  | "wake_ack";

export interface VoiceLineRow {
  id: string;
  category: VoiceCategory;
  lang: string;
  text: string;
  source: "seed" | "owner" | "llm";
  enabled: number;
  weight: number;
  lastUsedAt: number | null;
  useCount: number;
  createdAt: number;
  tod: string | null;
}

interface DbVoiceLine {
  id: string;
  category: string;
  lang: string;
  text: string;
  source: string;
  enabled: number;
  weight: number;
  last_used_at: number | null;
  use_count: number;
  created_at: number;
  tod: string | null;
}

export async function ensureVoiceLinesTable(): Promise<void> {
  const db = getDatabase();
  await db.execute(`CREATE TABLE IF NOT EXISTS voice_lines (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    lang TEXT NOT NULL DEFAULT 'en',
    text TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'seed',
    enabled INTEGER NOT NULL DEFAULT 1,
    weight REAL NOT NULL DEFAULT 1.0,
    last_used_at INTEGER,
    use_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    tod TEXT
  )`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_voice_lines_category_lang
    ON voice_lines(category, lang)`);
}

export async function getLinesByCategory(category: VoiceCategory, lang: string): Promise<VoiceLineRow[]> {
  await ensureVoiceLinesTable();
  const db = getDatabase();
  const rows = await db.select<DbVoiceLine[]>(
    `SELECT * FROM voice_lines
     WHERE category = ? AND lang = ? AND enabled = 1
     ORDER BY weight DESC`,
    [category, lang]
  );
  return rows.map(toRow);
}

export async function getAllLinesByCategory(category: VoiceCategory): Promise<VoiceLineRow[]> {
  await ensureVoiceLinesTable();
  const db = getDatabase();
  const rows = await db.select<DbVoiceLine[]>(
    `SELECT * FROM voice_lines WHERE category = ? ORDER BY lang, weight DESC`,
    [category]
  );
  return rows.map(toRow);
}

export async function insertLine(line: Omit<VoiceLineRow, "id"> & { id: string }): Promise<void> {
  await ensureVoiceLinesTable();
  const db = getDatabase();
  await db.execute(
    `INSERT INTO voice_lines (id, category, lang, text, source, enabled, weight, last_used_at, use_count, created_at, tod)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [line.id, line.category, line.lang, line.text, line.source, line.enabled, line.weight, line.lastUsedAt, line.useCount, line.createdAt, line.tod]
  );
}

export async function recordLineUsed(id: string): Promise<void> {
  const db = getDatabase();
  await db.execute(
    `UPDATE voice_lines SET last_used_at = ?, use_count = use_count + 1 WHERE id = ?`,
    [Date.now(), id]
  );
}

export async function disableLine(id: string): Promise<void> {
  const db = getDatabase();
  await db.execute(`UPDATE voice_lines SET enabled = 0 WHERE id = ?`, [id]);
}

export async function getRecentUsedIds(category: VoiceCategory, limit: number): Promise<string[]> {
  const db = getDatabase();
  const rows = await db.select<{ id: string }[]>(
    `SELECT id FROM voice_lines
     WHERE category = ? AND last_used_at IS NOT NULL
     ORDER BY last_used_at DESC LIMIT ?`,
    [category, limit]
  );
  return rows.map(r => r.id);
}

function toRow(r: DbVoiceLine): VoiceLineRow {
  return {
    id: r.id,
    category: r.category as VoiceCategory,
    lang: r.lang,
    text: r.text,
    source: r.source as "seed" | "owner" | "llm",
    enabled: r.enabled,
    weight: r.weight,
    lastUsedAt: r.last_used_at,
    useCount: r.use_count,
    createdAt: r.created_at,
    tod: r.tod,
  };
}
