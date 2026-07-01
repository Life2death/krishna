import { createClient, type Client, type InValue } from "@libsql/client";
import { SYNC_TABLES } from "./types";
import type { SyncConfig, TombstoneRow } from "./types";

export interface Transport {
  pushRows(table: string, rows: Record<string, unknown>[]): Promise<void>;
  deleteRows(table: string, ids: string[]): Promise<void>;
  pullRows(table: string, since: number): Promise<Record<string, unknown>[]>;
  pullTombstones(since: number): Promise<TombstoneRow[]>;
  close(): void;
}

const TABLE_DDL: Record<string, string> = {
  conversations: `id TEXT PRIMARY KEY, title TEXT, created_at INTEGER, updated_at INTEGER`,
  messages: `id TEXT PRIMARY KEY, conversation_id TEXT, role TEXT, content TEXT, timestamp INTEGER, attached_files TEXT, updated_at INTEGER`,
  memories: `id TEXT PRIMARY KEY, key TEXT, value TEXT, source TEXT, confirmed INTEGER DEFAULT 1, created_at INTEGER, last_used_at INTEGER, updated_at INTEGER`,
  memory_embeddings: `id TEXT PRIMARY KEY, memory_id TEXT, content TEXT, embedding TEXT, source TEXT DEFAULT 'memory', created_at INTEGER, updated_at INTEGER, embedding_model_version TEXT`,
  learned_actions: `id TEXT PRIMARY KEY, display_name TEXT, target TEXT, input TEXT, resolved_via TEXT, confidence REAL, created_at INTEGER, updated_at INTEGER`,
  skills: `id TEXT PRIMARY KEY, name TEXT, trigger_examples TEXT, params TEXT, plan_template TEXT, confirmed_by_user INTEGER DEFAULT 0, use_count INTEGER DEFAULT 0, created_at INTEGER, updated_at INTEGER`,
  system_prompts: `id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, prompt TEXT, created_at TEXT, updated_at TEXT`,
  reminders: `id TEXT PRIMARY KEY, text TEXT, due_at INTEGER, recurrence TEXT, skill_id TEXT, enabled INTEGER DEFAULT 1, created_at INTEGER, updated_at INTEGER`,
  voiceprint_samples: `id TEXT PRIMARY KEY, speaker TEXT DEFAULT 'primary', embedding TEXT, dims INTEGER, quality REAL, created_at TEXT, updated_at TEXT`,
};

function args(params?: unknown[]): InValue[] {
  return (params ?? []).map((p) => (p === undefined ? null : p)) as InValue[];
}

export function createTransport(config: SyncConfig): Transport {
  const client: Client = createClient({
    url: config.url,
    authToken: config.token,
  });

  async function ensureRemoteSchema(): Promise<void> {
    try {
      const ddl: string[] = [
        `CREATE TABLE IF NOT EXISTS sync_tombstones (
          table_name TEXT NOT NULL,
          row_id TEXT NOT NULL,
          deleted_at INTEGER NOT NULL,
          PRIMARY KEY (table_name, row_id)
        );`,
        `CREATE TABLE IF NOT EXISTS sync_state (
          table_name TEXT PRIMARY KEY,
          last_pulled_at INTEGER NOT NULL DEFAULT 0,
          last_pushed_at INTEGER NOT NULL DEFAULT 0
        );`,
      ];
      for (const table of SYNC_TABLES) {
        const cols = TABLE_DDL[table];
        if (cols) {
          ddl.push(`CREATE TABLE IF NOT EXISTS "${table}" (${cols});`);
        }
      }
      await client.executeMultiple(ddl.join('\n'));
    } catch (err) {
      console.error('[sync] Failed to ensure remote schema — tables may need manual setup:', err);
    }
  }

  const initialized = ensureRemoteSchema();

  return {
    async pushRows(table: string, rows: Record<string, unknown>[]): Promise<void> {
      if (rows.length === 0) return;
      await initialized;

      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map((c) => row[c]);

        const sql = `INSERT OR REPLACE INTO "${table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
        try {
          await client.execute({ sql, args: args(values) });
        } catch (err) {
          console.error(`[sync] pushRows failed for ${table} row ${row.id}:`, err);
        }
      }
    },

    async deleteRows(table: string, ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      await initialized;

      for (const id of ids) {
        try {
          await client.execute({
            sql: `DELETE FROM "${table}" WHERE id = ?`,
            args: [id],
          });
        } catch (err) {
          console.error(`[sync] deleteRows failed for ${table} id ${id}:`, err);
        }
      }
    },

    async pullRows(table: string, since: number): Promise<Record<string, unknown>[]> {
      await initialized;

      const result = await client.execute({
        sql: `SELECT * FROM "${table}" WHERE updated_at > ?`,
        args: [since],
      });

      return result.rows.map((row) => {
        const obj: Record<string, unknown> = {};
        for (const key of Object.keys(row)) {
          obj[key] = (row as Record<string, unknown>)[key];
        }
        return obj;
      });
    },

    async pullTombstones(since: number): Promise<TombstoneRow[]> {
      await initialized;

      const result = await client.execute({
        sql: 'SELECT table_name, row_id, deleted_at FROM sync_tombstones WHERE deleted_at > ?',
        args: [since],
      });

      return result.rows.map((row) => ({
        table_name: row.table_name as string,
        row_id: row.row_id as string,
        deleted_at: Number(row.deleted_at),
      }));
    },

    close(): void {
      client.close();
    },
  };
}
