import {
  setDriver,
  setHttpFetch,
  setSettingsGetter,
  setSecretGetter,
} from "@krishna/core";
import type { Client } from "@libsql/client";
import { createBrainClient, libsqlDriver } from "./db/libsql-driver.ts";
import { runMigrations } from "./db/migrations.ts";

/**
 * Boot the shared @krishna/core for the Node runtime — the brain's equivalent
 * of the Tauri app's `initializeCore()` in src/lib/startup.ts. Same seams,
 * different platform implementations:
 *   - SqlDriver        -> libSQL (instead of @tauri-apps/plugin-sql)
 *   - HttpFetch        -> native fetch (instead of @tauri-apps/plugin-http)
 *   - Settings getter  -> server defaults
 *   - Secret getter    -> brain holds secrets in env/config, not core
 */
export async function initCore(): Promise<Client> {
  const client = createBrainClient();
  await runMigrations(client);

  setDriver(libsqlDriver(client));

  setHttpFetch((url, options) => fetch(url, options as RequestInit));

  setSettingsGetter(() => ({
    responseLength: "auto",
    language: "english",
    autoScroll: true,
  }));

  setSecretGetter(async () => null);

  return client;
}
