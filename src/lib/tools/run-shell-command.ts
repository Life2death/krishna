import { invoke } from "@tauri-apps/api/core";
import type { Tool } from "./index";

export const runShellCommandTool: Tool = {
  name: "run_shell_command",
  description:
    "Run a shell command and return its output. Use for: opening VS Code at a path (code <path>), running git commands, npm commands, or any CLI tool. Requires confirmation.",
  run: async (args, _ctx) => {
    const command = args.command;
    if (!command) {
      return { success: false, error: "Missing required arg: command" };
    }
    try {
      const result = await invoke<string>("run_shell_command", { command });
      return { success: true, output: result, data: { output: result } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  },
};
