import { randomBytes } from "node:crypto";
import { config } from "../config.ts";

const SERVICE = "krishna-brain";
const ACCOUNT = "master-key";

function decodeEnvKey(s: string): Buffer {
  const buf = /^[0-9a-fA-F]{64}$/.test(s)
    ? Buffer.from(s, "hex")
    : Buffer.from(s, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "KRISHNA_MASTER_KEY must decode to 32 bytes (64 hex chars or base64).",
    );
  }
  return buf;
}

/**
 * Load the 256-bit field-encryption master key.
 *
 * Order:
 *   1. KRISHNA_MASTER_KEY env (hex64 or base64) — for headless/CI.
 *   2. OS keyring (Windows Credential Vault / macOS Keychain / libsecret).
 *      Generated and stored on first run; never written to disk in plaintext.
 *
 * Mirrors the Tauri app's `secure_get` custody model: the key lives in the
 * OS secret store, not in the repo or env files.
 */
export async function loadMasterKey(): Promise<Buffer> {
  if (config.masterKeyEnv) {
    return decodeEnvKey(config.masterKeyEnv);
  }

  // Lazy import so a missing native module only matters when the keyring path is used.
  const { Entry } = await import("@napi-rs/keyring");
  const entry = new Entry(SERVICE, ACCOUNT);

  let stored: string | null = null;
  try {
    stored = entry.getPassword();
  } catch {
    stored = null; // not found
  }

  if (stored) {
    const buf = Buffer.from(stored, "base64");
    if (buf.length === 32) return buf;
    // Corrupt entry — regenerate.
  }

  const key = randomBytes(32);
  entry.setPassword(key.toString("base64"));
  return key;
}
