import { invoke } from "@tauri-apps/api/core";

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    try {
      return await invoke<string | null>("secure_get", { key });
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    await invoke("secure_set", { key, value });
  },
};

/**
 * Check whether the Android KeyStore KEK has been generated (first-run seal done).
 * On desktop this always returns true.
 */
export async function hasSealedKey(): Promise<boolean> {
  try {
    return await invoke<boolean>("has_sealed_key");
  } catch {
    return true;
  }
}

/**
 * First-launch seal: generates a non-exportable AES-256-GCM key in the Android
 * hardware KeyStore (StrongBox when available), then stores the build-time-
 * injected KRISHNA_MASTER_KEY encrypted with that key.
 * No-op on desktop.
 */
export async function sealMasterKey(): Promise<void> {
  await invoke("seal_master_key");
}
