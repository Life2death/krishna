import { getDatabase } from "../database/driver";
import { SYNC_TABLES } from "./types";

export async function writeTombstone(table: string, rowId: string): Promise<void> {
  if (!SYNC_TABLES.includes(table as any)) return;
  const db = getDatabase();
  try {
    await db.execute(
      'INSERT OR REPLACE INTO sync_tombstones (table_name, row_id, deleted_at) VALUES (?, ?, ?)',
      [table, rowId, Date.now()]
    );
  } catch {
  }
}

export async function writeTombstones(table: string, rowIds: string[]): Promise<void> {
  if (!SYNC_TABLES.includes(table as any)) return;
  const db = getDatabase();
  const now = Date.now();
  for (const rowId of rowIds) {
    try {
      await db.execute(
        'INSERT OR REPLACE INTO sync_tombstones (table_name, row_id, deleted_at) VALUES (?, ?, ?)',
        [table, rowId, now]
      );
    } catch {
    }
  }
}
