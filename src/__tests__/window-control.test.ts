import { describe, it, expect, vi, beforeEach } from "vitest";
import { controlWindowTool, computerFocusWindowTool } from "@krishna/core/tools/computer";
import type { ToolContext } from "@krishna/core/tools";
import { setConfirmAction } from "@krishna/core/tools/mcp-bridge";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockCtx: ToolContext = { vars: {} };

describe("control_window tool", () => {
  beforeEach(() => {
    setConfirmAction(() => Promise.resolve(true));
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing args", async () => {
    const result = await controlWindowTool.run({}, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing required args");
  });

  it("rejects invalid action", async () => {
    const result = await controlWindowTool.run({ action: "teleport", target: "Chrome" }, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain("action must be 'focus' or 'move'");
  });

  it("routes focus action to computer_focus_window command", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as any).mockResolvedValue('Brought "Chrome" to the front.');

    const result = await controlWindowTool.run({ action: "focus", target: "Chrome" }, mockCtx);
    expect(result.success).toBe(true);
    expect(result.output).toBe('Brought "Chrome" to the front.');
    expect(invoke).toHaveBeenCalledWith("computer_focus_window", { titleSubstring: "Chrome" });
  });

  it("routes move action to window_move command", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as any).mockResolvedValue('Moved "Chrome" to the right monitor.');

    const result = await controlWindowTool.run(
      { action: "move", target: "Chrome", monitor: "right" },
      mockCtx,
    );
    expect(result.success).toBe(true);
    expect(result.output).toBe('Moved "Chrome" to the right monitor.');
    expect(invoke).toHaveBeenCalledWith("window_move", { query: "Chrome", monitor: "right", maximize: null });
  });

  it("defaults monitor to 'next' for move action", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as any).mockResolvedValue('Moved "Terminal" to the next monitor.');

    const result = await controlWindowTool.run({ action: "move", target: "Terminal" }, mockCtx);
    expect(result.success).toBe(true);
    expect(invoke).toHaveBeenCalledWith("window_move", { query: "Terminal", monitor: "next", maximize: null });
  });

  it("surfaces disambiguation error as tool error", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as any).mockRejectedValue(
      new Error('I can see "Settings", "File Explorer" - which one?'),
    );

    const result = await controlWindowTool.run({ action: "focus", target: "Photoshop" }, mockCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('I can see "Settings", "File Explorer"');
  });
});

describe("computer_focus_window tool (now implemented)", () => {
  beforeEach(() => {
    setConfirmAction(() => Promise.resolve(true));
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes the Rust command with the correct parameter name", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as any).mockResolvedValue('Brought "Settings" to the front.');

    const result = await computerFocusWindowTool.run(
      { title: "Settings" },
      { ...mockCtx, preConfirmed: true },
    );
    expect(result.success).toBe(true);
    expect(invoke).toHaveBeenCalledWith("computer_focus_window", { titleSubstring: "Settings" });
  });

  it("errors surface as tool error", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    (invoke as any).mockRejectedValue(new Error('I don\'t see any window matching "Unknown".'));

    const result = await computerFocusWindowTool.run(
      { title: "Unknown" },
      { ...mockCtx, preConfirmed: true },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("I don't see any window matching");
  });
});
