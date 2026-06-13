import { invoke } from "@tauri-apps/api/core";
import type { Tool } from "./index";

/**
 * Open a URL, file, or application.
 * Matches the Rust #[tauri::command] pub fn open_target(app_handle: tauri::AppHandle, target: String) -> Result<String, String>
 * The arg key MUST be "target" (matches Rust param name).
 */
export const openTargetTool: Tool = {
  name: "open_target",
  description: "Open a URL, file path, or application name. Use for deep-links (e.g., https://youtube.com/watch?v=...). Tier 1 reliability.",
  run: async (args, _ctx) => {
    const target = args.target;
    if (!target) {
      return { success: false, error: "Missing required arg: target" };
    }
    try {
      const result = await invoke<string>("open_target", { target });
      return { success: true, output: result, data: { target } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  },
};
