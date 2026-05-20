import { invoke } from "@tauri-apps/api/core";

export async function saveCredential(key: string, value: string): Promise<void> {
  try {
    await invoke("plugin:keychain|save_item", {
      key,
      password: value,
    });
  } catch (error) {
    console.error("Failed to save credential to keychain:", error);
    throw error;
  }
}

export async function getCredential(key: string): Promise<string | null> {
  try {
    const result = await invoke<string>("plugin:keychain|get_item", { key });
    return result ?? null;
  } catch (error) {
    console.error("Failed to get credential from keychain:", error);
    return null;
  }
}

export async function removeCredential(key: string): Promise<void> {
  try {
    await invoke("plugin:keychain|remove_item", { key });
  } catch (error) {
    console.error("Failed to remove credential from keychain:", error);
  }
}
