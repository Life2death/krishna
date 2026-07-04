import { getDatabase } from "../database/driver";

export async function getLastCheckAt(): Promise<number> {
  const db = getDatabase();
  const rows = await db.select<{ value: number }[]>(
    "SELECT value FROM recruiter_radar_state WHERE key = 'last_check_at'",
  );
  return rows.length > 0 ? rows[0].value : 0;
}

export async function setLastCheckAt(ts: number): Promise<void> {
  const db = getDatabase();
  await db.execute(
    "INSERT OR REPLACE INTO recruiter_radar_state (key, value) VALUES ('last_check_at', ?)",
    [ts],
  );
}

export async function getSeenIds(): Promise<Set<string>> {
  const db = getDatabase();
  const rows = await db.select<{ message_id: string }[]>(
    "SELECT message_id FROM recruiter_seen",
  );
  return new Set(rows.map((r) => r.message_id));
}

export async function markSeen(ids: string[], now?: number): Promise<void> {
  if (ids.length === 0) return;
  const db = getDatabase();
  const ts = now ?? Date.now();
  for (const id of ids) {
    await db.execute(
      "INSERT OR IGNORE INTO recruiter_seen (message_id, first_seen_at) VALUES (?, ?)",
      [id, ts],
    );
  }
}
