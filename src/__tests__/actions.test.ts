import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseActions, executeAction, decideActionResponse } from "@/lib/actions";
import { invoke } from "@tauri-apps/api/core";
import type { ExecuteActionResult } from "@/lib/actions";

const mockTravelToolRun = vi.hoisted(() => vi.fn());
const mockResolveTarget = vi.hoisted(() => vi.fn());

vi.mock("@krishna/core/tools/get-travel-time", () => ({
  getTravelTimeTool: {
    run: mockTravelToolRun,
  },
}));

vi.mock("@/lib/resolver", () => ({
  resolveTarget: mockResolveTarget,
  saveAndConfirm: vi.fn(),
  needsConfirmation: vi.fn().mockReturnValue(false),
}));

describe("parseActions", () => {
  it("parses open action from action block", () => {
    const result = parseActions('Sure, opening YouTube.\n```action\n{"action":"open","target":"https://youtube.com"}\n```');
    expect(result.spokenText).toBe("Sure, opening YouTube.");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ action: "open", target: "https://youtube.com" });
  });

  it("parses remember action from action block", () => {
    const result = parseActions('Got it.\n```action\n{"action":"remember","key":"jobs url","value":"https://job-hunter-x5l1.onrender.com/"}\n```');
    expect(result.spokenText).toBe("Got it.");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ action: "remember", key: "jobs url", value: "https://job-hunter-x5l1.onrender.com/" });
  });

  it("parses remember action with null key", () => {
    const result = parseActions('I will remember that.\n```action\n{"action":"remember","key":null,"value":"my password is hunter2"}\n```');
    expect(result.spokenText).toBe("I will remember that.");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ action: "remember", key: null, value: "my password is hunter2" });
  });

  it("parses remember action from json block", () => {
    const result = parseActions('Noted.\n```json\n{"action":"remember","key":"homepage","value":"https://example.com"}\n```');
    expect(result.spokenText).toBe("Noted.");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ action: "remember", key: "homepage", value: "https://example.com" });
  });

  it("parses both open and remember actions", () => {
    const result = parseActions('Sure.\n```action\n{"action":"remember","key":"jobs","value":"https://example.com"}\n```\n```action\n{"action":"open","target":"https://youtube.com"}\n```');
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toEqual({ action: "remember", key: "jobs", value: "https://example.com" });
    expect(result.actions[1]).toEqual({ action: "open", target: "https://youtube.com" });
  });

  it("ignores remember action with missing value", () => {
    const result = parseActions('```action\n{"action":"remember","key":"test"}\n```');
    expect(result.actions).toHaveLength(0);
  });

  it("returns empty actions for plain text", () => {
    const result = parseActions("Hello, how can I help you?");
    expect(result.actions).toHaveLength(0);
    expect(result.spokenText).toBe("Hello, how can I help you?");
  });

  it("strips action block from spokenText", () => {
    const result = parseActions('Opening YouTube.\n```action\n{"action":"open","target":"youtube"}\n```');
    expect(result.spokenText).toBe("Opening YouTube.");
    expect(result.actions).toHaveLength(1);
  });

  it("strips remember action block from spokenText", () => {
    const result = parseActions('Remembering that.\n```action\n{"action":"remember","key":"color","value":"blue"}\n```');
    expect(result.spokenText).toBe("Remembering that.");
    expect(result.actions).toHaveLength(1);
  });

  it("parses travel_time action from action block", () => {
    const result = parseActions('Checking route.\n```action\n{"action":"travel_time","from":"home","to":"work","mode":"car"}\n```');
    expect(result.spokenText).toBe("Checking route.");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ action: "travel_time", from: "home", to: "work", mode: "car" });
  });

  it("parses travel_time with defaults omitted", () => {
    const result = parseActions('```action\n{"action":"travel_time","to":"airport"}\n```');
    expect(result.actions[0]).toEqual({ action: "travel_time", to: "airport" });
  });

  it("parses travel_time with two_wheeler mode", () => {
    const result = parseActions('```action\n{"action":"travel_time","from":"home","to":"airport","mode":"two_wheeler"}\n```');
    expect(result.actions[0]).toEqual({ action: "travel_time", from: "home", to: "airport", mode: "two_wheeler" });
  });

  it("parses travel_time from json block", () => {
    const result = parseActions('```json\n{"action":"travel_time","from":"home","to":"work"}\n```');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ action: "travel_time", from: "home", to: "work" });
  });
});

// ── decideActionResponse (pure decision helper) ──────────────────────────

describe("decideActionResponse", () => {
  it("answer kind always speaks and records", () => {
    const r: ExecuteActionResult = { kind: "answer", spokenResponse: "By car, 40 min, sir.", ok: true };
    const plan = decideActionResponse(r, false);
    expect(plan?.shouldSpeak).toBe(true);
    expect(plan?.recordTurn).toBe(true);
    expect(plan?.outcome).toBe("answered");
    expect(plan?.failureReason).toBeUndefined();
  });

  it("answer kind with ok=false logs failed", () => {
    const r: ExecuteActionResult = { kind: "answer", spokenResponse: "No route.", ok: false };
    const plan = decideActionResponse(r, false);
    expect(plan?.shouldSpeak).toBe(true);
    expect(plan?.outcome).toBe("failed");
    expect(plan?.failureReason).toBe("tool_failed");
  });

  it("answer kind speaks even when ack was already spoken", () => {
    const r: ExecuteActionResult = { kind: "answer", spokenResponse: "By car, 40 min.", ok: true };
    const plan = decideActionResponse(r, true);
    expect(plan?.shouldSpeak).toBe(true);
  });

  it("status kind speaks only when no prior ack", () => {
    const r: ExecuteActionResult = { kind: "status", spokenResponse: "Opening chrome." };
    expect(decideActionResponse(r, false)?.shouldSpeak).toBe(true);
    expect(decideActionResponse(r, true)?.shouldSpeak).toBe(false);
  });

  it("status kind with Failed prefix logs tool_failed", () => {
    const r: ExecuteActionResult = { kind: "status", spokenResponse: "Failed to open x." };
    const plan = decideActionResponse(r, false);
    expect(plan?.outcome).toBe("failed");
    expect(plan?.failureReason).toBe("tool_failed");
  });

  it("status kind with ok=false logs tool_failed (even without Failed prefix)", () => {
    const r: ExecuteActionResult = { kind: "status", ok: false, spokenResponse: "I couldn't find an app." };
    const plan = decideActionResponse(r, false);
    expect(plan?.outcome).toBe("failed");
    expect(plan?.failureReason).toBe("tool_failed");
  });

  it("legacy (no kind) with Opening prefix speaks and logs answered", () => {
    const r: ExecuteActionResult = { spokenResponse: "Opening youtube." };
    const plan = decideActionResponse(r, false);
    expect(plan?.shouldSpeak).toBe(true);
    expect(plan?.outcome).toBe("answered");
  });

  it("legacy (no kind) with Failed prefix speaks and logs tool_failed", () => {
    const r: ExecuteActionResult = { spokenResponse: "Failed to open x." };
    const plan = decideActionResponse(r, false);
    expect(plan?.shouldSpeak).toBe(true);
    expect(plan?.outcome).toBe("failed");
    expect(plan?.failureReason).toBe("tool_failed");
  });

  it("legacy (no kind) without prefix is silent (no speak)", () => {
    const r: ExecuteActionResult = { spokenResponse: "By car it's 40 min." };
    expect(decideActionResponse(r, false)).toBeNull();
  });

  it("returns null for empty spokenResponse", () => {
    const r: ExecuteActionResult = { spokenResponse: "" };
    expect(decideActionResponse(r, false)).toBeNull();
  });
});

// ── executeAction ─────────────────────────────────────────────────────────

describe("executeAction — travel_time", () => {
  beforeEach(() => {
    mockTravelToolRun.mockReset();
    vi.mocked(invoke).mockReset();
  });

  it("returns kind:answer with ok:true on tool success", async () => {
    mockTravelToolRun.mockResolvedValue({
      success: true,
      output: "By car it's about 40 minutes, sir.",
      data: { fallback: "false", duration: "2400" },
    });

    const result = await executeAction({
      action: "travel_time",
      from: "home",
      to: "work",
      mode: "car",
    });

    expect(result.kind).toBe("answer");
    expect(result.ok).toBe(true);
    expect(result.spokenResponse).toContain("40 minutes");
  });

  it("returns kind:answer with ok:true on fallback (no key)", async () => {
    mockTravelToolRun.mockResolvedValue({
      success: true,
      output: "I've opened the route on Maps. Add a Maps API key in Settings and I can read out times with live traffic, sir.",
      data: { url: "https://google.com/maps/dir/", fallback: "true" },
    });

    const result = await executeAction({
      action: "travel_time",
      from: "home",
      to: "work",
      mode: "car",
    });

    expect(result.kind).toBe("answer");
    expect(result.ok).toBe(true);
    expect(result.spokenResponse).toContain("Add a Maps API key");
  });

  it("returns kind:answer with ok:undefined on missing destination (clarification, not failure)", async () => {
    const result = await executeAction({
      action: "travel_time",
      from: "home",
      to: "",
      mode: "car",
    });

    expect(result.kind).toBe("answer");
    expect(result.ok).toBeUndefined();
    expect(result.spokenResponse).toBe("Where would you like to go?");
  });

  it("returns kind:answer with ok matching tool's success flag", async () => {
    mockTravelToolRun.mockResolvedValue({
      success: false,
      output: "I couldn't find a route.",
    });

    const result = await executeAction({
      action: "travel_time",
      from: "home",
      to: "nowhere",
    });

    expect(result.kind).toBe("answer");
    expect(result.ok).toBe(false);
  });

  it("opens the URL when tool returns a data.url", async () => {
    mockTravelToolRun.mockResolvedValue({
      success: true,
      output: "Opened route.",
      data: { url: "https://google.com/maps/dir/", fallback: "true" },
    });

    await executeAction({
      action: "travel_time",
      from: "home",
      to: "work",
    });

    expect(invoke).toHaveBeenCalledWith("open_target", {
      target: "https://google.com/maps/dir/",
    });
  });

  it("does not crash if URL open fails", async () => {
    mockTravelToolRun.mockResolvedValue({
      success: true,
      output: "Opened route.",
      data: { url: "https://google.com/maps/dir/", fallback: "true" },
    });
    vi.mocked(invoke).mockRejectedValue(new Error("open failed"));

    const result = await executeAction({
      action: "travel_time",
      from: "home",
      to: "work",
    });

    expect(result.kind).toBe("answer");
    expect(result.ok).toBe(true);
  });
});

describe("executeAction — open", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    mockResolveTarget.mockReset();
  });

  it("returns kind:status for URL open success", async () => {
    vi.mocked(invoke).mockResolvedValue("OK");

    const result = await executeAction({
      action: "open",
      target: "https://youtube.com",
    });

    expect(result.kind).toBe("status");
    expect(result.spokenResponse).toBe("Opening https://youtube.com");
  });

  it("returns kind:status for URL open failure", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("fail"));

    const result = await executeAction({
      action: "open",
      target: "https://example.com",
    });

    expect(result.kind).toBe("status");
    expect(result.spokenResponse).toBe("Failed to open https://example.com");
  });

  it("returns kind:status for unknown app with ok:false", async () => {
    mockResolveTarget.mockResolvedValue({
      found: false,
      target: null,
      displayName: "xyznonexistentapp12345",
      source: "search" as const,
    });

    const result = await executeAction({
      action: "open",
      target: "xyznonexistentapp12345",
    });

    expect(result.kind).toBe("status");
    expect(result.ok).toBe(false);
    expect(result.spokenResponse).toContain("couldn't find an app");
  });
});
