import { invoke } from "@tauri-apps/api/core";
import { SYNC_TABLES } from "./types";
import type { SyncConfig, TombstoneRow } from "./types";
import type { Transport } from "./transport";

const TABLE_DDL: Record<string, string> = {
  conversations: `id TEXT PRIMARY KEY, title TEXT, created_at INTEGER, updated_at INTEGER`,
  messages: `id TEXT PRIMARY KEY, conversation_id TEXT, role TEXT, content TEXT, timestamp INTEGER, attached_files TEXT, updated_at INTEGER`,
  memories: `id TEXT PRIMARY KEY, key TEXT, value TEXT, source TEXT, confirmed INTEGER DEFAULT 1, created_at INTEGER, last_used_at INTEGER, updated_at INTEGER`,
  memory_embeddings: `id TEXT PRIMARY KEY, memory_id TEXT, content TEXT, embedding TEXT, source TEXT DEFAULT 'memory', created_at INTEGER, updated_at INTEGER, embedding_model_version TEXT`,
  learned_actions: `id TEXT PRIMARY KEY, display_name TEXT, target TEXT, input TEXT, resolved_via TEXT, confidence REAL, created_at INTEGER, updated_at INTEGER`,
  skills: `id TEXT PRIMARY KEY, name TEXT, trigger_examples TEXT, params TEXT, plan_template TEXT, confirmed_by_user INTEGER DEFAULT 0, use_count INTEGER DEFAULT 0, created_at INTEGER, updated_at INTEGER`,
  system_prompts: `id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, prompt TEXT, created_at INTEGER, updated_at INTEGER`,
  reminders: `id TEXT PRIMARY KEY, text TEXT, due_at INTEGER, recurrence TEXT, skill_id TEXT, enabled INTEGER DEFAULT 1, created_at INTEGER, updated_at INTEGER`,
  voiceprint_samples: `id TEXT PRIMARY KEY, speaker TEXT DEFAULT 'primary', embedding TEXT, dims INTEGER, quality REAL, created_at INTEGER, updated_at INTEGER`,
  device_commands: `id TEXT PRIMARY KEY, source_kind TEXT, target_kind TEXT, command_text TEXT, status TEXT DEFAULT 'pending', result TEXT, created_at INTEGER, updated_at INTEGER`,
};

function sqlEscapeId(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

export function createRustTransport(config: SyncConfig): Transport {
  const { url, token } = config;

  async function ensureRemoteSchema(): Promise<void> {
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
        ddl.push(`CREATE TABLE IF NOT EXISTS ${sqlEscapeId(table)} (${cols});`);
      }
    }
    await invoke("sync_exec_multiple", { url, token, sqlList: ddl });
  }

  const initialized = ensureRemoteSchema();

  return {
    async pushRows(table: string, rows: Record<string, unknown>[]): Promise<void> {
      if (rows.length === 0) return;
      await initialized;

      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map(() => "?").join(", ");
        const args = columns.map((c) => {
          const v = row[c];
          return v === undefined ? null : (typeof v === "number" ? v : String(v));
        });

        const sql = `INSERT OR REPLACE INTO ${sqlEscapeId(table)} (${columns.map(sqlEscapeId).join(", ")}) VALUES (${placeholders})`;
        await invoke("sync_exec", { url, token, sql, args });
      }
    },

    async deleteRows(table: string, ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      await initialized;

      for (const id of ids) {
        await invoke("sync_exec", {
          url, token,
          sql: `DELETE FROM ${sqlEscapeId(table)} WHERE id = ?`,
          args: [id],
        });
      }
    },

    async pullRows(table: string, since: number): Promise<Record<string, unknown>[]> {
      await initialized;

      const rows = await invoke<unknown[][]>("sync_exec", {
        url, token,
        sql: `SELECT * FROM ${sqlEscapeId(table)} WHERE updated_at > ?`,
        args: [since],
      });

      return rows.map((row) => {
        const obj: Record<string, unknown> = {};
        // Columns returned by Turso pipeline: snake_case from table DDL
        const cols = Object.keys(TABLE_DDL).includes(table)
          ? TABLE_DDL[table]
              .split(",")
              .map((c) => c.trim().split(" ")[0])
          : [];
        for (let i = 0; i < row.length && i < cols.length; i++) {
          obj[cols[i]] = row[i];
        }
        return obj;
      });
    },

    async pullTombstones(since: number): Promise<TombstoneRow[]> {
      await initialized;

      const rows = await invoke<unknown[][]>("sync_exec", {
        url, token,
        sql: "SELECT table_name, row_id, deleted_at FROM sync_tombstones WHERE deleted_at > ?",
        args: [since],
      });

      return rows.map((r) => ({
        table_name: String(r[0] ?? ""),
        row_id: String(r[1] ?? ""),
        deleted_at: Number(r[2] ?? 0),
      }));
    },

    close(): void {
      // Nothing to close — Rust handles HTTP connections
    },
  };
}
