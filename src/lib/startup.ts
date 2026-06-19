import Database from "@tauri-apps/plugin-sql";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { setDriver } from "@krishna/core/database/driver";
import { setHttpFetch } from "@krishna/core/http";
import { setSettingsGetter } from "@krishna/core/settings";
import { setSecretGetter } from "@krishna/core/secrets";
import { safeLocalStorage } from "@krishna/core/safe-local-storage";

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
}
