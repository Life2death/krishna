import { createClient, type Client, type InValue } from "@libsql/client";
import type { SqlDriver } from "@krishna/core/database/driver";
import { config } from "../config.ts";

/**
 * Build a libSQL client. Local file by default; if KRISHNA_SYNC_URL is set the
 * local file becomes an embedded replica that syncs to Turso cloud.
 */
export function createBrainClient(): Client {
  if (config.syncUrl) {
    return createClient({
      url: `file:${config.dbPath}`,
      syncUrl: config.syncUrl,
      authToken: config.syncToken || undefined,
      syncInterval: config.syncInterval > 0 ? config.syncInterval : undefined,
    });
  }
  return createClient({ url: `file:${config.dbPath}` });
}

/**
 * Adapt a libSQL Client to the core SqlDriver interface so the shared
 * `*.action.ts` files run unchanged in Node, exactly as they do in Tauri.
 */
export function libsqlDriver(client: Client): SqlDriver {
  // Tauri's plugin-sql silently coerces `undefined` bind params to NULL; libSQL
  // throws on them. Match Tauri so the shared core action files behave identically
  // on both drivers (e.g. AUTOINCREMENT ids passed as undefined become NULL).
  const args = (params?: unknown[]): InValue[] =>
    (params ?? []).map((p) => (p === undefined ? null : p)) as InValue[];

  return {
    async select<T>(sql: string, params?: unknown[]): Promise<T> {
      const res = await client.execute({ sql, args: args(params) });
      return res.rows as unknown as T;
    },
    async execute(sql: string, params?: unknown[]) {
      const res = await client.execute({ sql, args: args(params) });
      return {
        rowsAffected: res.rowsAffected,
        lastInsertId:
          res.lastInsertRowid != null ? Number(res.lastInsertRowid) : undefined,
      };
    },
  };
}
