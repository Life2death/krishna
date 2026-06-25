import {
  setDriver,
  setHttpFetch,
  setSettingsGetter,
  setSecretGetter,
} from "@krishna/core";
import { createClient, type Client } from "@libsql/client";
import { createBrainClient, libsqlDriver } from "./db/libsql-driver.ts";
import { runMigrations } from "./db/migrations.ts";
import { config } from "./config.ts";

/**
 * Boot the shared @krishna/core for the Node runtime — the brain's equivalent
 * of the Tauri app's `initializeCore()` in src/lib/startup.ts. Same seams,
 * different platform implementations:
 *   - SqlDriver        -> libSQL (instead of @tauri-apps/plugin-sql)
 *   - HttpFetch        -> native fetch (instead of @tauri-apps/plugin-http)
 *   - Settings getter  -> server defaults
 *   - Secret getter    -> brain holds secrets in env/config, not core
 *
 * **Boot resilience:** when Turso sync is configured but the remote is
 * unreachable (transient DNS, network blip), the first migration + write
 * fails because libSQL's embedded-replica needs a working primary. This
 * function catches that error, falls back to a local-only client, and
 * records the failure in sync-status so the /status endpoint reflects it.
 */
export async function initCore(): Promise<Client> {
  let client: Client;

  if (config.syncUrl) {
    // Try sync-enabled boot; on failure degrade to local-only.
    try {
      client = createBrainClient();
      await runMigrations(client);
    } catch (err) {
      console.warn(
        "[db] Sync migration failed — falling back to local-only:",
        (err as Error)?.message ?? err,
      );
      const { updateSyncStatus, initSyncStatus } = await import("./db/sync-status");
      initSyncStatus();
      updateSyncStatus({ enabled: false, lastError: (err as Error)?.message ?? String(err) });

      client = createClient({ url: `file:${config.dbPath}` });
      await runMigrations(client);
    }
  } else {
    client = createBrainClient();
    await runMigrations(client);
  }

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
