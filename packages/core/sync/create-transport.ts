import type { SyncConfig } from "./types";
import type { Transport } from "./transport";
import { createTransport as createLibSqlTransport } from "./transport";
import { createRustTransport } from "./rust-transport";

/**
 * Create a sync Transport, auto-detecting the available backend.
 *
 * Priority:
 * 1. Android / iOS WebView → Rust Tauri commands (reqwest). The `@libsql/client`
 *    web build IMPORTS fine in the Android WebView, but its `fetch` to the Turso
 *    HTTP endpoint fails with "TypeError: Failed to fetch" (CORS / WebView network
 *    restrictions). An import-only probe can't catch that, so we force the Rust
 *    transport on mobile — reqwest runs natively and bypasses the WebView entirely.
 * 2. Desktop / other WebViews → `@libsql/client` if it imports, else Rust.
 */
let cached: Transport | null = null;
let useRust = false;

/**
 * Android/iOS WebView detection via userAgent (no Tauri dependency, so this file
 * stays independent of the app layer). Mirrors src/lib/platform.ts#isMobileDevice.
 */
function isMobileWebView(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

async function probeLibSql(): Promise<boolean> {
  try {
    // Minimal probe: can we import and create a client?
    const { createClient } = await import("@libsql/client");
    // Just verify the constructor exists
    return typeof createClient === "function";
  } catch {
    return false;
  }
}

export async function createTransport(config: SyncConfig): Promise<Transport> {
  if (cached) return cached;

  // On mobile the WebView fetch to Turso is blocked (CORS), so skip the libsql
  // web transport entirely and go straight to the Rust-backed transport.
  if (isMobileWebView()) {
    console.log("[sync] Mobile WebView — using Rust-backed transport (Turso via Tauri/reqwest)");
    cached = createRustTransport(config);
    return cached;
  }

  if (!useRust) {
    const ok = await probeLibSql();
    if (ok) {
      try {
        cached = createLibSqlTransport(config);
        return cached;
      } catch {
        // Fall through to Rust
      }
    }
    useRust = true;
  }

  console.log("[sync] Using Rust-backed transport (Turso HTTP pipeline via Tauri commands)");
  cached = createRustTransport(config);
  return cached;
}
