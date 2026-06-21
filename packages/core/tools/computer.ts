import { invoke } from "@tauri-apps/api/core";
import type { Tool } from "./index";
import { getConfirmAction } from "./mcp-bridge";

async function confirmOrAbort(description: string): Promise<boolean> {
  const fn = getConfirmAction();
  if (!fn) return false;
  return fn(description);
}

export const computerTypeTool: Tool = {
  name: "computer_type",
  description: "Type literal text into the currently focused window or field. Requires user confirmation.",
  run: async (args) => {
    const text = args.text;
    if (!text) return { success: false, error: "Missing required arg: text" };
    if (!(await confirmOrAbort(`Type "${text}" into the focused window`)))
      return { success: false, error: "User declined" };
    try {
      const result = await invoke<string>("computer_type", { text });
      return { success: true, output: result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};

export const computerKeyTool: Tool = {
  name: "computer_key",
  description: "Press a key or key-combo (e.g. 'enter', 'ctrl+c', 'alt+tab') into the focused window. Requires user confirmation.",
  run: async (args) => {
    const keys = args.keys;
    if (!keys) return { success: false, error: "Missing required arg: keys" };
    if (!(await confirmOrAbort(`Press "${keys}" into the focused window`)))
      return { success: false, error: "User declined" };
    try {
      const result = await invoke<string>("computer_key", { keys });
      return { success: true, output: result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};

export const computerClickTool: Tool = {
  name: "computer_click",
  description: "Click the mouse (left, right, or middle) at the current cursor position. Requires user confirmation.",
  run: async (args) => {
    const button = args.button || "left";
    if (!(await confirmOrAbort(`Click ${button} mouse button`)))
      return { success: false, error: "User declined" };
    try {
      const result = await invoke<string>("computer_click", { button });
      return { success: true, output: result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};

export const computerMoveTool: Tool = {
  name: "computer_move",
  description: "Move the mouse cursor to absolute screen coordinates (x, y). Requires user confirmation.",
  run: async (args) => {
    const x = parseInt(args.x, 10);
    const y = parseInt(args.y, 10);
    if (isNaN(x) || isNaN(y)) return { success: false, error: "Missing or invalid args: x, y (integers)" };
    if (!(await confirmOrAbort(`Move mouse to (${x}, ${y})`)))
      return { success: false, error: "User declined" };
    try {
      const result = await invoke<string>("computer_move", { x, y });
      return { success: true, output: result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};

export const computerFocusWindowTool: Tool = {
  name: "computer_focus_window",
  description: "Bring a window to the foreground by matching its title. NOTE: not yet implemented on most platforms — please focus the target window manually.",
  run: async (args) => {
    const title = args.title;
    if (!title) return { success: false, error: "Missing required arg: title" };
    if (!(await confirmOrAbort(`Focus window with title containing "${title}"`)))
      return { success: false, error: "User declined" };
    try {
      const result = await invoke<string>("computer_focus_window", { titleSubstring: title });
      return { success: true, output: result };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};
