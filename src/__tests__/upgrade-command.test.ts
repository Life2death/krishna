import { describe, expect, it } from "vitest";
import {
  createLocalUpgradeDraft,
  parseUpgradeCommand,
  summarizeUpgradeTitle,
  validateCreateUpgradeTaskInput,
} from "@krishna/core/upgrades";

describe("upgrade command capture", () => {
  it("captures improve-yourself requests before generic LLM handling", () => {
    expect(parseUpgradeCommand("improve yourself so you can zoom maps by voice")).toEqual({
      intent: "create",
      requestText: "you can zoom maps by voice",
    });
  });

  it("recognizes local queue/status commands", () => {
    expect(parseUpgradeCommand("what upgrades are pending?")).toEqual({ intent: "list" });
    expect(parseUpgradeCommand("analyze the next upgrade now")).toEqual({ intent: "analyze_next" });
    expect(parseUpgradeCommand("approve the map zoom implementation")).toEqual({ intent: "approve" });
  });

  it("builds a safe local-only task draft", () => {
    const draft = createLocalUpgradeDraft("zoom maps by voice", "voice", "android", "cmd_1");

    expect(draft.title).toBe("Zoom maps by voice");
    expect(draft.originCommandLogId).toBe("cmd_1");
    expect(draft.providerPolicy).toBe("codex_plus_claude");
    expect(draft.acceptanceCriteria).toContain("The task remains local-only until cross-device sync is enabled.");
  });

  it("keeps generated titles compact", () => {
    expect(summarizeUpgradeTitle("krishna add a very long feature that keeps going forever with extra detail")).toBe(
      "Add a very long feature that keeps going forever",
    );
  });

  it("rejects empty local tasks", () => {
    expect(() => validateCreateUpgradeTaskInput({ requestText: "   " })).toThrow("Upgrade request text is required");
  });
});
