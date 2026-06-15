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
