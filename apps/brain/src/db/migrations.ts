import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Client } from "@libsql/client";

/**
 * Migrations applied on boot, in the same order Tauri registers them
 * (src-tauri/src/db/main.rs). The legacy `interview-profiles*` migrations
 * (Tauri versions 3/4/5) are intentionally skipped — they are vestigial from
 * the Krishna lineage and the brain never touches that table.
 *
 * All files use `CREATE TABLE IF NOT EXISTS`, so re-running every boot is safe.
 */
const MIGRATIONS = [
  "system-prompts.sql", // Tauri v1
  "chat-history.sql", // Tauri v2
  "learned-actions-v2.sql", // Tauri v7
  "skills.sql", // Tauri v8
  "memories.sql", // Tauri v9
  "audit-log.sql", // Tauri v10
  "reminders.sql", // Tauri v11
  "devices.sql", // Tauri v12
  "rag.sql", // brain-specific
];

const migrationsDir = fileURLToPath(
  new URL("../../../../src-tauri/src/db/migrations/", import.meta.url),
);

export async function runMigrations(client: Client): Promise<void> {
  for (const file of MIGRATIONS) {
    const sql = await readFile(migrationsDir + file, "utf8");
    // executeMultiple runs all statements in the script (handles triggers).
    await client.executeMultiple(sql);
  }
}
