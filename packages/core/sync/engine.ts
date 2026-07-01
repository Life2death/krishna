import { getDatabase } from "../database/driver";
import type { Transport } from "./transport";
import { SyncStateStore } from "./sync-state";
import { SYNC_TABLES, EXCLUDED_TABLES } from "./types";
import type { SyncConfig, SyncResult } from "./types";

export class SyncEngine {
  private transport: Transport;
  private stateStore: SyncStateStore;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(transport: Transport) {
    this.transport = transport;
    this.stateStore = new SyncStateStore();
  }

  start(intervalMs: number): void {
    this.syncNow();
    this.timer = setInterval(() => this.syncNow(), intervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async syncNow(): Promise<SyncResult> {
    if (this.running) return { pulled: 0, pushed: 0, tombstonesPulled: 0, tombstonesPushed: 0, errors: [] };
    this.running = true;

    const result: SyncResult = { pulled: 0, pushed: 0, tombstonesPulled: 0, tombstonesPushed: 0, errors: [] };

    try {
      const pushResult = await this.push();
      result.pushed = pushResult.pushed;
      result.tombstonesPushed = pushResult.tombstonesPushed;

      const pullResult = await this.pull();
      result.pulled = pullResult.pulled;
      result.tombstonesPulled = pullResult.tombstonesPulled;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[sync] sync cycle failed:', msg);
      result.errors.push(msg);
    } finally {
      this.running = false;
    }

    return result;
  }

  private async safeGetRows(table: string, since: number): Promise<{ rows: Record<string, unknown>[]; maxUpdatedAt: number }> {
    const db = getDatabase();
    let maxUpdatedAt = 0;
    try {
      const rows = await db.select<any[]>(
        `SELECT * FROM "${table}" WHERE updated_at > ? ORDER BY updated_at ASC`,
        [since]
      );
      const mapped = rows.map((row) => {
        const obj: Record<string, unknown> = {};
        for (const key of Object.keys(row)) {
          obj[key] = (row as Record<string, unknown>)[key];
        }
        const ua = this.parseTimestamp(obj.updated_at);
        if (ua > maxUpdatedAt) maxUpdatedAt = ua;
        return obj;
      });
      return { rows: mapped, maxUpdatedAt };
    } catch {
      return { rows: [], maxUpdatedAt };
    }
  }

  private parseTimestamp(val: unknown): number {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      if (/^\d+$/.test(val)) return parseInt(val, 10);
      const match = val.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        return Date.UTC(
          parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]),
          parseInt(match[4]), parseInt(match[5]), parseInt(match[6])
        );
      }
      const parsed = Date.parse(val);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  private async push(): Promise<{ pushed: number; tombstonesPushed: number }> {
    const db = getDatabase();
    let pushed = 0;
    let tombstonesPushed = 0;

    for (const table of SYNC_TABLES) {
      try {
        const state = await this.stateStore.getState(table);
        const { rows, maxUpdatedAt } = await this.safeGetRows(table, state.lastPushedAt);

        const tombstoneRows = await db.select<any[]>(
          'SELECT row_id, deleted_at FROM sync_tombstones WHERE table_name = ? AND deleted_at > ?',
          [table, state.lastPushedAt]
        );

        const hasRows = rows.length > 0;
        const hasTombstones = tombstoneRows.length > 0;

        if (hasRows || hasTombstones) {
          if (hasRows) {
            await this.transport.pushRows(table, rows);
            pushed += rows.length;
          }

          if (tombstoneRows.length > 0) {
            const ids = tombstoneRows.map((r: any) => r.row_id);
            await this.transport.deleteRows(table, ids);
            tombstonesPushed += ids.length;
          }

          const newPushedAt = Math.max(
            maxUpdatedAt,
            tombstoneRows.length > 0
              ? Math.max(...tombstoneRows.map((r: any) => Number(r.deleted_at)))
              : 0
          );

          await this.stateStore.setPushedAt(table, newPushedAt);
        }
      } catch (err) {
        console.error(`[sync] push failed for ${table}:`, err);
      }
    }

    return { pushed, tombstonesPushed };
  }

  private async pull(): Promise<{ pulled: number; tombstonesPulled: number }> {
    const db = getDatabase();
    let pulled = 0;
    let tombstonesPulled = 0;

    for (const table of SYNC_TABLES) {
      try {
        const state = await this.stateStore.getState(table);

        const remoteRows = await this.transport.pullRows(table, state.lastPulledAt);

        for (const remoteRow of remoteRows) {
          const remoteUpdatedAt = this.parseTimestamp(remoteRow.updated_at);
          const remoteId = remoteRow.id as string;

          if (remoteUpdatedAt === 0) continue;

          const localRows = await db.select<any[]>(
            `SELECT updated_at FROM "${table}" WHERE id = ?`,
            [remoteId]
          );

          let shouldUpsert = true;
          if (localRows.length > 0) {
            const localUpdatedAt = this.parseTimestamp(localRows[0].updated_at);
            if (localUpdatedAt >= remoteUpdatedAt) {
              shouldUpsert = false;
            }
          }

          if (shouldUpsert) {
            const columns = Object.keys(remoteRow);
            const placeholders = columns.map(() => '?').join(', ');
            const values = columns.map((c) => remoteRow[c]);

            try {
              await db.execute(
                `INSERT OR REPLACE INTO "${table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
                values
              );
              pulled++;
            } catch (err) {
              console.error(`[sync] upsert failed for ${table} row ${remoteId}:`, err);
            }
          }
        }

        const tombstones = await this.transport.pullTombstones(state.lastPulledAt);
        for (const t of tombstones) {
          if (t.table_name === table) {
            try {
              await db.execute(`DELETE FROM "${table}" WHERE id = ?`, [t.row_id]);
              tombstonesPulled++;
            } catch (err) {
              console.error(`[sync] delete failed for ${table} row ${t.row_id}:`, err);
            }
          }
        }

        if (remoteRows.length > 0 || tombstones.length > 0) {
          const maxRemoteUpdatedAt = remoteRows.reduce(
            (max, r) => Math.max(max, this.parseTimestamp(r.updated_at)),
            0
          );
          const maxTombstoneDeletedAt = tombstones.reduce(
            (max, t) => (t.table_name === table ? Math.max(max, t.deleted_at) : max),
            0
          );
          const newPulledAt = Math.max(maxRemoteUpdatedAt, maxTombstoneDeletedAt);
          await this.stateStore.setPulledAt(table, newPulledAt);
        }
      } catch (err) {
        console.error(`[sync] pull failed for ${table}:`, err);
      }
    }

    return { pulled, tombstonesPulled };
  }
}
