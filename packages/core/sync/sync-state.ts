import { getDatabase } from "../database/driver";

interface DbSyncState {
  table_name: string;
  last_pulled_at: number;
  last_pushed_at: number;
}

export class SyncStateStore {
  async getState(table: string): Promise<{ lastPulledAt: number; lastPushedAt: number }> {
    const db = getDatabase();
    const rows = await db.select<DbSyncState[]>(
      'SELECT last_pulled_at, last_pushed_at FROM sync_state WHERE table_name = ?',
      [table]
    );
    if (rows.length === 0) {
      await db.execute(
        'INSERT INTO sync_state (table_name, last_pulled_at, last_pushed_at) VALUES (?, 0, 0)',
        [table]
      );
      return { lastPulledAt: 0, lastPushedAt: 0 };
    }
    return {
      lastPulledAt: Number(rows[0].last_pulled_at),
      lastPushedAt: Number(rows[0].last_pushed_at),
    };
  }

  async setPulledAt(table: string, ts: number): Promise<void> {
    const db = getDatabase();
    await db.execute(
      'UPDATE sync_state SET last_pulled_at = ? WHERE table_name = ?',
      [ts, table]
    );
  }

  async setPushedAt(table: string, ts: number): Promise<void> {
    const db = getDatabase();
    await db.execute(
      'UPDATE sync_state SET last_pushed_at = ? WHERE table_name = ?',
      [ts, table]
    );
  }
}
