import Database from "@tauri-apps/plugin-sql";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { setDriver } from "@krishna/core/database/driver";
import { setHttpFetch } from "@krishna/core/http";
import { setSettingsGetter } from "@krishna/core/settings";
import { setSecretGetter, getSecret } from "@krishna/core/secrets";
import { safeLocalStorage } from "@krishna/core/safe-local-storage";
import { registerTools } from "@krishna/core/tools";
import { COMPUTER_TOOLS } from "@krishna/core/tools/computer";
import { SyncEngine, createTransport } from "@krishna/core/sync";

let _syncEngine: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine | null {
  return _syncEngine;
}

async function startSync(): Promise<void> {
  try {
    const syncUrl = await getSecret("KRISHNA_SYNC_URL");
    const syncToken = await getSecret("KRISHNA_SYNC_TOKEN");

    if (!syncUrl || !syncToken) {
      console.log("[sync] Sync not configured — Local only mode");
      return;
    }

    const transport = createTransport({ url: syncUrl, token: syncToken });
    const engine = new SyncEngine(transport);
    _syncEngine = engine;

    const interval = 60000;
    engine.start(interval);
    console.log(`[sync] Started (interval: ${interval}ms)`);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        engine.syncNow();
      }
    });
  } catch (err) {
    console.error("[sync] Failed to initialize sync:", err);
  }
}

export async function initializeCore(): Promise<void> {
  const db = await Database.load("sqlite:krishna.db");

  setDriver({
    select: (sql, params) => db.select(sql, params),
    execute: (sql, params) => db.execute(sql, params),
  });

  setHttpFetch((url, opts) =>
    url.includes("http") ? (tauriFetch as typeof fetch)(url, opts) : fetch(url, opts)
  );

  setSettingsGetter(() => {
    try {
      const stored = safeLocalStorage.getItem("response_settings");
      return stored
        ? JSON.parse(stored)
        : { responseLength: "auto", language: "english", autoScroll: true };
    } catch {
      return { responseLength: "auto", language: "english", autoScroll: true };
    }
  });

  setSecretGetter(async (key: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<string | null>("secure_get", { key });
    } catch {
      return null;
    }
  });

  const customizableRaw = safeLocalStorage.getItem("customizable");
  if (customizableRaw) {
    try {
      const config = JSON.parse(customizableRaw);
      if (config?.computerControl?.enabled) {
        registerTools(COMPUTER_TOOLS);
      }
    } catch {
      /* ignore parse error */
    }
  }

  await startSync();
}
