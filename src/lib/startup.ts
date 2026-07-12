import Database from "@tauri-apps/plugin-sql";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { setDriver } from "@krishna/core/database/driver";
import { setHttpFetch } from "@krishna/core/http";
import { setSettingsGetter } from "@krishna/core/settings";
import { setSecretGetter, getSecret } from "@krishna/core/secrets";
import { safeLocalStorage } from "@krishna/core/safe-local-storage";
import { registerTools } from "@krishna/core/tools";
import { COMPUTER_TOOLS } from "@krishna/core/tools/computer";
import { SyncEngine } from "@krishna/core/sync";
import { createTransport } from "@krishna/core/sync/create-transport";

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

    const transport = await createTransport({ url: syncUrl, token: syncToken });
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
      const base = stored
        ? JSON.parse(stored)
        : { responseLength: "auto", language: "english", autoScroll: true, honorific: "sir" };
      return {
        responseLength: base.responseLength ?? "auto",
        language: base.language ?? "english",
        autoScroll: base.autoScroll ?? true,
        honorific: base.honorific ?? "sir",
        voiceMaxTokens: base.voiceMaxTokens ?? 100,
        voiceModel: base.voiceModel ?? "",
      };
    } catch {
      return { responseLength: "auto", language: "english", autoScroll: true, honorific: "sir", voiceMaxTokens: 100, voiceModel: "" };
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

  // Seed the build-baked OpenAI Realtime key into the secure store so Live Voice
  // works on mobile without typing a key. No-op on desktop (baked key is None)
  // and never overwrites a key the user already set.
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const existing = await invoke<string | null>("secure_get", {
      key: "openai_realtime_api_key",
    });
    if (!existing) {
      const baked = await invoke<string | null>("get_baked_realtime_key");
      if (baked) {
        await invoke("secure_set", {
          key: "openai_realtime_api_key",
          value: baked,
        });
      }
    }
  } catch (err) {
    console.error("[startup] realtime key seed failed:", err);
  }

  // Seed the build-baked Anthropic key as the SELECTED Claude AI provider on
  // mobile. The classic pipeline reads `provider_<id>_api_key` + the
  // `curl_selected_ai_provider` localStorage entry — NOT the raw
  // ANTHROPIC_API_KEY the setup wizard stores — and the first-run default is
  // OpenRouter with no key, so without this seed every mobile AI call failed
  // with "Missing required variable: api_key". No-op on desktop (baked key is
  // None); never overwrites an existing key or a provider the user selected.
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const baked = await invoke<string | null>("get_baked_anthropic_key");
    if (baked) {
      const existingKey = await invoke<string | null>("secure_get", {
        key: "provider_claude_api_key",
      });
      if (!existingKey) {
        await invoke("secure_set", {
          key: "provider_claude_api_key",
          value: baked,
        });
      }
      // Select Claude when nothing is selected OR the selection is the
      // first-run OpenRouter default that has no key behind it (that state can
      // only produce "Missing required variable: api_key"). A user-configured
      // OpenRouter (key present) is left alone.
      const selRaw = safeLocalStorage.getItem("curl_selected_ai_provider");
      let replaceSelection = !selRaw;
      if (selRaw) {
        try {
          const sel = JSON.parse(selRaw);
          if (sel?.provider === "openrouter") {
            const orKey = await invoke<string | null>("secure_get", {
              key: "provider_openrouter_api_key",
            });
            if (!orKey) replaceSelection = true;
          }
        } catch {
          replaceSelection = true;
        }
      }
      if (replaceSelection) {
        const model =
          (await invoke<string | null>("secure_get", { key: "KRISHNA_CLAUDE_MODEL" })) ||
          "claude-sonnet-4-6";
        safeLocalStorage.setItem(
          "curl_selected_ai_provider",
          JSON.stringify({ provider: "claude", variables: { model } })
        );
      }
    }
  } catch (err) {
    console.error("[startup] anthropic provider seed failed:", err);
  }

  // Seed the build-baked Google Maps key (travel-time tool) on mobile.
  // No-op on desktop; never overwrites an existing key.
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const existing = await invoke<string | null>("secure_get", {
      key: "GOOGLE_MAPS_API_KEY",
    });
    if (!existing) {
      const baked = await invoke<string | null>("get_baked_maps_key");
      if (baked) {
        await invoke("secure_set", { key: "GOOGLE_MAPS_API_KEY", value: baked });
      }
    }
  } catch (err) {
    console.error("[startup] maps key seed failed:", err);
  }

  await startSync();
}
