import type { SyncConfig } from "./types";
import type { Transport } from "./transport";
import { createTransport as createLibSqlTransport } from "./transport";
import { createRustTransport } from "./rust-transport";

/**
 * Create a sync Transport, auto-detecting the available backend.
 *
 * Priority:
 * 1. `@libsql/client` (works on desktop and most WebView environments).
 * 2. Rust Tauri commands (fallback for restrictive Android WebView).
 *
 * The auto-detection: if `@libsql/client` import fails at runtime
 * (e.g. in a WebView where its web build can't initialise), we silently
 * switch to the Rust-backed transport.
 */
let cached: Transport | null = null;
let useRust = false;

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
