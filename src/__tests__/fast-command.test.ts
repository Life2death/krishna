import { describe, expect, it } from "vitest";
import { parseFastCommand } from "@/lib/fast-command";

describe("parseFastCommand", () => {
  it("routes direct open commands locally", () => {
    expect(parseFastCommand("open chrome")).toEqual({
      reason: "open",
      action: { action: "open", target: "chrome" },
    });
  });

  it("routes focus commands to window control", () => {
    expect(parseFastCommand("bring Teams to front")).toEqual({
      reason: "window",
      action: { action: "control_window", mode: "focus", target: "Teams" },
    });
  });

  it("routes monitor move commands to window control", () => {
    expect(parseFastCommand("move Chrome to the other monitor")).toEqual({
      reason: "window",
      action: { action: "control_window", mode: "move", target: "Chrome", monitor: "next" },
    });
  });

  it("routes saved job searches locally", () => {
    expect(parseFastCommand("open my program manager search")).toEqual({
      reason: "saved_search",
      action: { action: "open_saved_search", target: "program manager" },
    });
  });

  it("does not capture broad show/query wording", () => {
    expect(parseFastCommand("show my job queue")).toBeNull();
    expect(parseFastCommand("what is the weather")).toBeNull();
  });
});
