import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseActions, executeAction, resolveActionForConfirm, decideActionResponse, detectPhantomSave, extractJsonArray, buildRecruiterClassify } from "@/lib/actions";
import { resolveAppAlias } from "@/config/app-aliases";
import type { Candidate, Classification } from "@krishna/core/tools/recruiter-radar";
import { invoke } from "@tauri-apps/api/core";
import type { ExecuteActionResult } from "@/lib/actions";

const mockTravelToolRun = vi.hoisted(() => vi.fn());
const mockSuggestDepartureRun = vi.hoisted(() => vi.fn());
const mockJobQueueRun = vi.hoisted(() => vi.fn());
const mockGmailSearchRun = vi.hoisted(() => vi.fn());
const mockGmailReadRun = vi.hoisted(() => vi.fn());
const mockGmailListLabelsRun = vi.hoisted(() => vi.fn());
const mockGmailSendRun = vi.hoisted(() => vi.fn());
const mockGmailFetchRecruiterCandidates = vi.hoisted(() => vi.fn());
const mockRunRecruiterRadar = vi.hoisted(() => vi.fn());
const mockFormatRecruiterOutput = vi.hoisted(() => vi.fn());
const mockGetLastCheckAt = vi.hoisted(() => vi.fn());
const mockResolveTarget = vi.hoisted(() => vi.fn());
const mockCreateRouteWatch = vi.hoisted(() => vi.fn());
const mockGetActiveRouteWatch = vi.hoisted(() => vi.fn());
const mockCancelRouteWatch = vi.hoisted(() => vi.fn());
const mockResolvePlace = vi.hoisted(() => vi.fn());
const mockControlWindowRun = vi.hoisted(() => vi.fn());
const mockGetAllSavedSearches = vi.hoisted(() => vi.fn());
const mockGetCurrentPositionSafe = vi.hoisted(() => vi.fn());
const mockIsMobileDevice = vi.hoisted(() => vi.fn().mockReturnValue(false));

vi.mock("@krishna/core/tools/get-travel-time", () => ({
  getTravelTimeTool: {
    run: mockTravelToolRun,
  },
  suggestDepartureTimeTool: {
    run: mockSuggestDepartureRun,
  },
}));

vi.mock("@krishna/core/tools/job-queue", () => ({
  getJobQueueTool: {
    run: mockJobQueueRun,
  },
}));

vi.mock("@krishna/core/tools/gmail", () => ({
  gmailSearchMessagesTool: { run: mockGmailSearchRun },
  gmailReadMessageTool: { run: mockGmailReadRun },
  gmailListLabelsTool: { run: mockGmailListLabelsRun },
  gmailSendEmailTool: { run: mockGmailSendRun },
  gmailFetchRecruiterCandidates: mockGmailFetchRecruiterCandidates,
}));

vi.mock("@krishna/core/tools/recruiter-radar", () => ({
  runRecruiterRadar: mockRunRecruiterRadar,
  formatRecruiterOutput: mockFormatRecruiterOutput,
  COLD_START_DAYS: 7,
}));

vi.mock("@krishna/core/tools/recruiter-radar-state", () => ({
  getLastCheckAt: mockGetLastCheckAt,
}));

vi.mock("@/lib/resolver", () => ({
  resolveTarget: mockResolveTarget,
  saveAndConfirm: vi.fn(),
  needsConfirmation: vi.fn().mockReturnValue(false),
}));

vi.mock("@krishna/core/database", () => ({
  createRouteWatch: mockCreateRouteWatch,
  getActiveRouteWatch: mockGetActiveRouteWatch,
  cancelRouteWatch: mockCancelRouteWatch,
}));

vi.mock("@krishna/core/tools/place-resolver", () => ({
  resolvePlace: mockResolvePlace,
}));

vi.mock("@krishna/core/tools/computer", () => ({
  controlWindowTool: { run: mockControlWindowRun },
}));

vi.mock("@krishna/core/database/saved-searches.action", () => ({
  getAllSavedSearches: mockGetAllSavedSearches,
}));

vi.mock("@/lib/geolocation", () => ({
  getCurrentPositionSafe: mockGetCurrentPositionSafe,
}));

vi.mock("@/lib/platform", () => ({
  isMobileDevice: mockIsMobileDevice,
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

  it("parses travel_best action from action block", () => {
    const result = parseActions('Best time to leave.\n```action\n{"action":"travel_best","from":"home","to":"work","mode":"car"}\n```');
    expect(result.spokenText).toBe("Best time to leave.");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ action: "travel_best", from: "home", to: "work", mode: "car" });
  });

  it("parses travel_best with window_hours", () => {
    const result = parseActions('```action\n{"action":"travel_best","from":"home","to":"work","window_hours":2}\n```');
    expect(result.actions[0]).toEqual({ action: "travel_best", from: "home", to: "work", window_hours: 2 });
  });

  it("parses travel_best from json block", () => {
    const result = parseActions('```json\n{"action":"travel_best","from":"home","to":"gym","mode":"bicycle"}\n```');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ action: "travel_best", from: "home", to: "gym", mode: "bicycle" });
  });

  it("parses gmail_recruiters action from action block", () => {
    const result = parseActions('Checking recruiter mail.\n```action\n{"action":"gmail_recruiters"}\n```');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ action: "gmail_recruiters" });
  });

  it("parses gmail_recruiters with window_days", () => {
    const result = parseActions('```action\n{"action":"gmail_recruiters","window_days":7}\n```');
    expect(result.actions[0]).toEqual({ action: "gmail_recruiters", window_days: 7 });
  });

  it("parses route_watch action from action block", () => {
    const result = parseActions('Keeping an eye.\n```action\n{"action":"route_watch","from":"work","to":"home","mode":"car","threshold_minutes":40}\n```');
    expect(result.actions[0]).toEqual({ action: "route_watch", from: "work", to: "home", mode: "car", threshold_minutes: 40 });
  });

  it("parses route_watch with all optional fields", () => {
    const result = parseActions('```action\n{"action":"route_watch","from":"home","to":"work","threshold_minutes":30,"interval_minutes":10,"window_hours":2}\n```');
    expect(result.actions[0]).toEqual({ action: "route_watch", from: "home", to: "work", threshold_minutes: 30, interval_minutes: 10, window_hours: 2 });
  });

  it("parses route_watch_cancel action", () => {
    const result = parseActions('```action\n{"action":"route_watch_cancel"}\n```');
    expect(result.actions[0]).toEqual({ action: "route_watch_cancel" });
  });

  // Regression: control_window was registered as a plan-executor tool but never
  // recognized as an action, so "bring Teams to the front" was silently dropped
  // and the LLM's spoken "done" had no tool behind it (audit_log stayed empty).
  it("parses control_window focus action", () => {
    const result = parseActions('On it, sir.\n```action\n{"action":"control_window","mode":"focus","target":"Teams"}\n```');
    expect(result.spokenText).toBe("On it, sir.");
    expect(result.actions[0]).toEqual({ action: "control_window", mode: "focus", target: "Teams", monitor: undefined });
  });

  it("parses control_window move action with monitor", () => {
    const result = parseActions('```action\n{"action":"control_window","mode":"move","target":"Chrome","monitor":"next"}\n```');
    expect(result.actions[0]).toEqual({ action: "control_window", mode: "move", target: "Chrome", monitor: "next" });
  });

  it("defaults control_window mode to focus and ignores when target missing", () => {
    expect(parseActions('```action\n{"action":"control_window","target":"Teams"}\n```').actions[0])
      .toEqual({ action: "control_window", mode: "focus", target: "Teams", monitor: undefined });
    expect(parseActions('```action\n{"action":"control_window","mode":"move"}\n```').actions).toHaveLength(0);
  });

  it("parses open_saved_search action from action block", () => {
    const result = parseActions('On it.\n```action\n{"action":"open_saved_search","target":"PM Mumbai belt"}\n```');
    expect(result.spokenText).toBe("On it.");
    expect(result.actions[0]).toEqual({ action: "open_saved_search", target: "PM Mumbai belt" });
  });

  it("ignores open_saved_search without target", () => {
    const result = parseActions('```action\n{"action":"open_saved_search"}\n```');
    expect(result.actions.filter((a) => a.action === "open_saved_search")).toHaveLength(0);
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

  it("propagates errorDetail from tool data on API fallback", async () => {
    mockTravelToolRun.mockResolvedValue({
      success: true,
      output: "I've opened the route on Maps — the live traffic lookup didn't go through this time, sir.",
      data: { url: "https://google.com/maps/dir/", fallback: "true", errorDetail: "Google Routes API error (403): quota exceeded" },
    });

    const result = await executeAction({
      action: "travel_time",
      from: "home",
      to: "work",
    });

    expect(result.errorDetail).toBe("Google Routes API error (403): quota exceeded");
    expect(result.ok).toBe(true);
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

  it("returns the URL as deferredUrl instead of opening it immediately", async () => {
    mockTravelToolRun.mockResolvedValue({
      success: true,
      output: "Opened route.",
      data: { url: "https://google.com/maps/dir/", fallback: "true" },
    });

    const result = await executeAction({
      action: "travel_time",
      from: "home",
      to: "work",
    });

    // Opening here (before the answer is spoken) backgrounds the app and lets
    // Android kill the process before TTS plays — the caller must open
    // deferredUrl only after speaking the response.
    expect(invoke).not.toHaveBeenCalledWith("open_target", expect.anything());
    expect(result.deferredUrl).toBe("https://google.com/maps/dir/");
  });

  it("omits deferredUrl when the tool has no url", async () => {
    mockTravelToolRun.mockResolvedValue({
      success: true,
      output: "By car it's about 22 minutes, sir.",
      data: { fallback: "false" },
    });

    const result = await executeAction({
      action: "travel_time",
      from: "home",
      to: "work",
    });

    expect(result.deferredUrl).toBeUndefined();
  });

  // ── GPS origin resolution ────────────────────────────────────────────────

  describe("travel_time — GPS origin resolution", () => {
    beforeEach(() => {
      mockTravelToolRun.mockReset();
      vi.mocked(invoke).mockReset();
      mockGetCurrentPositionSafe.mockReset();
    });

    it("uses GPS coords when no from given on mobile", async () => {
      mockIsMobileDevice.mockReturnValue(true);
      mockGetCurrentPositionSafe.mockResolvedValue({ lat: 19.076, lng: 72.877 });
      mockTravelToolRun.mockResolvedValue({
        success: true,
        output: "By car it's about 22 minutes from your current location, sir.",
        data: { fallback: "false" },
      });

      const result = await executeAction({
        action: "travel_time",
        to: "work",
        mode: "car",
      });

      expect(mockGetCurrentPositionSafe).toHaveBeenCalledOnce();
      expect(mockTravelToolRun).toHaveBeenCalledWith(
        { from: "19.076,72.877", to: "work", mode: "car" },
        { vars: {} },
      );
      expect(result.kind).toBe("answer");
      expect(result.ok).toBe(true);
    });

    it("falls back to home when GPS returns null on mobile", async () => {
      mockIsMobileDevice.mockReturnValue(true);
      mockGetCurrentPositionSafe.mockResolvedValue(null);
      mockTravelToolRun.mockResolvedValue({
        success: true,
        output: "By car it's about 40 minutes from home, sir.",
        data: { fallback: "false" },
      });

      const result = await executeAction({
        action: "travel_time",
        to: "work",
        mode: "car",
      });

      expect(mockGetCurrentPositionSafe).toHaveBeenCalledOnce();
      expect(mockTravelToolRun).toHaveBeenCalledWith(
        { from: "home", to: "work", mode: "car" },
        { vars: {} },
      );
      expect(result.ok).toBe(true);
    });

    it("still uses explicit 'home' when given (GPS not called)", async () => {
      mockIsMobileDevice.mockReturnValue(true);
      mockTravelToolRun.mockResolvedValue({
        success: true,
        output: "By car it's about 40 minutes from home, sir.",
        data: { fallback: "false" },
      });

      await executeAction({
        action: "travel_time",
        from: "home",
        to: "work",
        mode: "car",
      });

      expect(mockGetCurrentPositionSafe).not.toHaveBeenCalled();
      expect(mockTravelToolRun).toHaveBeenCalledWith(
        { from: "home", to: "work", mode: "car" },
        { vars: {} },
      );
    });

    it("falls back to home on desktop (GPS never called)", async () => {
      mockIsMobileDevice.mockReturnValue(false);
      mockTravelToolRun.mockResolvedValue({
        success: true,
        output: "By car it's about 40 minutes from home, sir.",
        data: { fallback: "false" },
      });

      await executeAction({
        action: "travel_time",
        to: "work",
        mode: "car",
      });

      expect(mockGetCurrentPositionSafe).not.toHaveBeenCalled();
      expect(mockTravelToolRun).toHaveBeenCalledWith(
        { from: "home", to: "work", mode: "car" },
        { vars: {} },
      );
    });
  });
});

describe("executeAction — travel_best", () => {
  beforeEach(() => {
    mockSuggestDepartureRun.mockReset();
    vi.mocked(invoke).mockReset();
  });

  it("returns kind:answer with ok:true on tool success", async () => {
    mockSuggestDepartureRun.mockResolvedValue({
      success: true,
      output: "Leaving now is 58 minutes, sir. If you wait until 9:30 it drops to 41 — that's your best window in the next 3 hours.",
      data: { bestDepartureTime: "2026-07-05T09:30:00.000Z", bestDuration: "2460" },
    });

    const result = await executeAction({
      action: "travel_best",
      from: "home",
      to: "work",
      mode: "car",
    });

    expect(result.kind).toBe("answer");
    expect(result.ok).toBe(true);
    expect(result.spokenResponse).toContain("best window");
    expect(result.spokenResponse).toContain("58 minutes");
  });

  it("returns kind:answer with ok:false on tool failure", async () => {
    mockSuggestDepartureRun.mockResolvedValue({
      success: false,
      error: "Google Maps API key is not configured. Add one in Settings.",
    });

    const result = await executeAction({
      action: "travel_best",
      from: "home",
      to: "work",
    });

    expect(result.kind).toBe("answer");
    expect(result.ok).toBe(false);
    expect(result.spokenResponse).toContain("API key is not configured");
  });

  it("propagates errorDetail on tool failure", async () => {
    mockSuggestDepartureRun.mockResolvedValue({
      success: false,
      error: "All departure samples failed",
      data: { errorDetail: "Google Routes API error (403): quota exceeded" },
    });

    const result = await executeAction({
      action: "travel_best",
      from: "home",
      to: "work",
    });

    expect(result.errorDetail).toBe("Google Routes API error (403): quota exceeded");
    expect(result.ok).toBe(false);
  });

  it("returns kind:answer with clarification on missing destination", async () => {
    const result = await executeAction({
      action: "travel_best",
      from: "home",
      to: "",
    });

    expect(result.kind).toBe("answer");
    expect(result.ok).toBeUndefined();
    expect(result.spokenResponse).toBe("Where would you like to go?");
  });

  it("catches thrown errors and surfaces them", async () => {
    mockSuggestDepartureRun.mockRejectedValue(new Error("Network error"));

    const result = await executeAction({
      action: "travel_best",
      from: "home",
      to: "work",
    });

    expect(result.kind).toBe("answer");
    expect(result.ok).toBe(false);
    expect(result.spokenResponse).toBe("I couldn't check departure times, sir.");
    expect(result.errorDetail).toBe("Network error");
  });

  // ── GPS origin resolution ────────────────────────────────────────────────

  describe("travel_best — GPS origin resolution", () => {
    beforeEach(() => {
      mockSuggestDepartureRun.mockReset();
      vi.mocked(invoke).mockReset();
      mockGetCurrentPositionSafe.mockReset();
    });

    it("uses GPS coords when no from given on mobile", async () => {
      mockIsMobileDevice.mockReturnValue(true);
      mockGetCurrentPositionSafe.mockResolvedValue({ lat: 19.076, lng: 72.877 });
      mockSuggestDepartureRun.mockResolvedValue({
        success: true,
        output: "Leaving now is 30 minutes, sir. If you wait...",
        data: { bestDepartureTime: "2026-07-05T09:30:00.000Z", bestDuration: "1800" },
      });

      const result = await executeAction({
        action: "travel_best",
        to: "work",
        mode: "car",
      });

      expect(mockGetCurrentPositionSafe).toHaveBeenCalledOnce();
      expect(mockSuggestDepartureRun).toHaveBeenCalledWith(
        { from: "19.076,72.877", to: "work", mode: "car", window_hours: "3" },
        { vars: {} },
      );
      expect(result.kind).toBe("answer");
      expect(result.ok).toBe(true);
    });

    it("falls back to home when GPS returns null", async () => {
      mockIsMobileDevice.mockReturnValue(true);
      mockGetCurrentPositionSafe.mockResolvedValue(null);
      mockSuggestDepartureRun.mockResolvedValue({
        success: true,
        output: "Leaving now is 30 minutes, sir.",
        data: { bestDepartureTime: "2026-07-05T09:30:00.000Z", bestDuration: "1800" },
      });

      const result = await executeAction({
        action: "travel_best",
        to: "work",
        mode: "car",
      });

      expect(mockGetCurrentPositionSafe).toHaveBeenCalledOnce();
      expect(mockSuggestDepartureRun).toHaveBeenCalledWith(
        { from: "home", to: "work", mode: "car", window_hours: "3" },
        { vars: {} },
      );
      expect(result.ok).toBe(true);
    });

    it("falls back to home on desktop", async () => {
      mockIsMobileDevice.mockReturnValue(false);

      await executeAction({
        action: "travel_best",
        to: "work",
        mode: "car",
      });

      expect(mockGetCurrentPositionSafe).not.toHaveBeenCalled();
      expect(mockSuggestDepartureRun).toHaveBeenCalledWith(
        { from: "home", to: "work", mode: "car", window_hours: "3" },
        { vars: {} },
      );
    });
  });
});

describe("executeAction — route_watch", () => {
  const now = 1780000000000;

  beforeEach(() => {
    vi.setSystemTime(now);
    mockResolvePlace.mockReset();
    mockCreateRouteWatch.mockReset();
    mockGetActiveRouteWatch.mockReset();
    mockCancelRouteWatch.mockReset();
  });

  it("arms a new watch with correct expiry", async () => {
    mockResolvePlace.mockImplementation((p: string) => p === "home" ? "123 Main St" : p);
    mockGetActiveRouteWatch.mockResolvedValue(null);
    mockCreateRouteWatch.mockImplementation((w: any) => w);

    const result = await executeAction({
      action: "route_watch",
      from: "home",
      to: "work",
      mode: "car",
      threshold_minutes: 40,
    });

    expect(result.kind).toBe("status");
    expect(result.ok).toBe(true);
    expect(result.spokenResponse).toContain("Watching");
    expect(result.spokenResponse).toContain("123 Main St");
    expect(result.spokenResponse).toContain("40 minutes");
    expect(mockCreateRouteWatch).toHaveBeenCalled();

    const watch = mockCreateRouteWatch.mock.calls[0][0];
    expect(watch.origin).toBe("123 Main St");
    expect(watch.destination).toBe("work");
    expect(watch.mode).toBe("car");
    expect(watch.threshold_minutes).toBe(40);
    expect(watch.interval_minutes).toBe(15);
    // expires_at should be ~4h from now
    expect(watch.expires_at).toBe(now + 4 * 3600000);
    expect(watch.status).toBe("active");
  });

  it("replaces existing active watch on rearm", async () => {
    mockResolvePlace.mockImplementation((p: string) => p === "home" ? "123 Main St" : p);
    mockGetActiveRouteWatch.mockResolvedValue({
      id: "old-id", origin: "456 Oak Ave", destination: "work",
    });
    mockCancelRouteWatch.mockResolvedValue(true);
    mockCreateRouteWatch.mockImplementation((w: any) => w);

    await executeAction({
      action: "route_watch",
      from: "home",
      to: "work",
      mode: "car",
      threshold_minutes: 30,
    });

    expect(mockCancelRouteWatch).toHaveBeenCalledWith("old-id");
    expect(mockCreateRouteWatch).toHaveBeenCalled();
  });

  it("cancels an active watch", async () => {
    mockGetActiveRouteWatch.mockResolvedValue({
      id: "watch-1", origin: "123 Main St", destination: "work",
    });
    mockCancelRouteWatch.mockResolvedValue(true);

    const result = await executeAction({
      action: "route_watch_cancel",
    });

    expect(result.kind).toBe("status");
    expect(result.ok).toBe(true);
    expect(result.spokenResponse).toContain("Cancelled");
    expect(mockCancelRouteWatch).toHaveBeenCalledWith("watch-1");
  });

  it("refuses to arm when address is not found", async () => {
    mockResolvePlace.mockImplementation((p: string) => p); // returns input unchanged
    mockGetActiveRouteWatch.mockResolvedValue(null);

    const result = await executeAction({
      action: "route_watch",
      from: "home",
      to: "unknownplace",
      mode: "car",
    });

    expect(result.spokenResponse).toContain("don't have your unknownplace address");
    expect(mockCreateRouteWatch).not.toHaveBeenCalled();
  });

  it("returns status message when no active watch to cancel", async () => {
    mockGetActiveRouteWatch.mockResolvedValue(null);

    const result = await executeAction({
      action: "route_watch_cancel",
    });

    expect(result.kind).toBe("status");
    expect(result.spokenResponse).toContain("no active route watch");
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

  it("resolves job pipeline alias via resolveAppAlias", () => {
    const alias = resolveAppAlias("job pipeline");
    expect(alias).not.toBeNull();
    expect(alias!.type).toBe("url");
    expect(alias!.launchCommand).toBe("https://job-hunter-x5l1.onrender.com/queue");
  });

  it("opens job pipeline URL via invoke when target matches alias", async () => {
    vi.mocked(invoke).mockResolvedValue("OK");

    const result = await executeAction({
      action: "open",
      target: "job pipeline",
    });

    expect(invoke).toHaveBeenCalledWith("open_target", {
      target: "https://job-hunter-x5l1.onrender.com/queue",
    });
    expect(result.kind).toBe("status");
    expect(result.spokenResponse).toBe("Opening Job Pipeline");
  });
});

describe("executeAction — control_window", () => {
  beforeEach(() => {
    mockControlWindowRun.mockReset();
  });

  it("routes focus to controlWindowTool and speaks the real result (not confirm-gated)", async () => {
    mockControlWindowRun.mockResolvedValue({ success: true, output: 'Brought "Teams" to the front.' });

    const result = await executeAction({ action: "control_window", mode: "focus", target: "Teams", monitor: undefined });

    expect(mockControlWindowRun).toHaveBeenCalledWith(
      { action: "focus", target: "Teams" },
      { vars: {} },
    );
    expect(result.needsConfirmation).toBeUndefined();
    expect(result.kind).toBe("status");
    expect(result.ok).toBe(true);
    expect(result.spokenResponse).toBe('Brought "Teams" to the front.');
  });

  it("passes monitor through for move", async () => {
    mockControlWindowRun.mockResolvedValue({ success: true, output: 'Moved "Chrome" to the next monitor.' });

    await executeAction({ action: "control_window", mode: "move", target: "Chrome", monitor: "next" });

    expect(mockControlWindowRun).toHaveBeenCalledWith(
      { action: "move", target: "Chrome", monitor: "next" },
      { vars: {} },
    );
  });

  it("surfaces a failed/ambiguous result honestly instead of claiming success", async () => {
    mockControlWindowRun.mockResolvedValue({ success: false, error: 'I can see "Settings", "File Explorer" - which one?' });

    const result = await executeAction({ action: "control_window", mode: "focus", target: "Photoshop", monitor: undefined });

    expect(result.ok).toBe(false);
    expect(result.spokenResponse).toContain("which one?");
    expect(result.errorDetail).toContain("which one?");
  });
});

// ── extractJsonArray (recruiter-radar RR-3 robust JSON extraction) ──────

describe("extractJsonArray", () => {
  it("parses a bare JSON array", () => {
    const result = extractJsonArray('[{"id":"m1","class":"recruiter_outreach"}]');
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[])[0].id).toBe("m1");
  });

  it("strips ```json fence and preamble", () => {
    const raw = "Here are the classifications:\n```json\n[{\"id\":\"m1\",\"class\":\"recruiter_outreach\"}]\n```";
    const result = extractJsonArray(raw);
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[])[0].class).toBe("recruiter_outreach");
  });

  it("strips bare ``` fence", () => {
    const raw = "```\n[{\"id\":\"m1\",\"class\":\"job_alert_digest\"}]\n```";
    const result = extractJsonArray(raw);
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[])[0].class).toBe("job_alert_digest");
  });

  it("extracts array from text with trailing sentences", () => {
    const raw = '```json\n[{"id":"m1","class":"other"}]\n```\nThat\'s all, sir.';
    const result = extractJsonArray(raw);
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[])[0].class).toBe("other");
  });

  it("throws on missing array brackets", () => {
    expect(() => extractJsonArray("no brackets here")).toThrow("No JSON array found");
  });

  it("throws on genuinely malformed JSON", () => {
    expect(() => extractJsonArray("[broken json")).toThrow();
  });
});

describe("buildRecruiterClassify", () => {
  it("parses fenced JSON and returns classifications (LLM path taken, not degraded)", async () => {
    const llmFallback = vi.fn().mockResolvedValue(
      'Here are the classifications:\n```json\n[{"id":"m1","class":"recruiter_outreach","recruiterName":"Priya","company":"ABC","via":"direct"},{"id":"m2","class":"job_alert_digest","via":"linkedin"}]\n```',
    );
    const classify = buildRecruiterClassify(llmFallback);

    const candidates: Candidate[] = [
      { id: "m1", from: "priya@abc.com", subject: "Role", snippet: "..." },
      { id: "m2", from: "jobs@linkedin.com", subject: "Digest", snippet: "..." },
    ];
    const result = await classify(candidates);

    expect(result).toHaveLength(2);
    expect(result[0].class).toBe("recruiter_outreach");
    expect(result[0].recruiterName).toBe("Priya");
    expect(result[1].class).toBe("job_alert_digest");
    // LLM path was taken — no error thrown, so downstream checkRecruiters
    // will see valid classifications and NOT fall back to heuristic
    expect(llmFallback).toHaveBeenCalledTimes(1);
  });

  it("throws on empty LLM response (falls through to heuristic safety net)", async () => {
    const llmFallback = vi.fn().mockResolvedValue(null);
    const classify = buildRecruiterClassify(llmFallback);
    await expect(classify([])).rejects.toThrow("LLM classify returned empty");
  });

  it("throws on missing array brackets (falls through to heuristic safety net)", async () => {
    const llmFallback = vi.fn().mockResolvedValue("no brackets here");
    const classify = buildRecruiterClassify(llmFallback);
    await expect(classify([])).rejects.toThrow("No JSON array found");
  });
});

// ── detectPhantomSave (T4-F1 grounding) ──────────────────────────────────
// Tests the REAL exported helper (userCommand + spokenText + actions → boolean),
// not a re-declared regex — this is the layer the grounding logic actually runs at.

describe("executeAction — open_saved_search", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    mockGetAllSavedSearches.mockReset();
  });

  it("opens search on exact name match", async () => {
    mockGetAllSavedSearches.mockResolvedValue([
      { id: "s1", name: "PM Mumbai belt", roleTag: "program-manager", url: "https://naukri.com/pm", chromeProfileDir: "Profile 1", chromeProfileName: "PM", mode: "manual", resumePathOverride: null, created_at: 1 },
    ]);
    vi.mocked(invoke).mockResolvedValue("OK");

    const result = await executeAction({ action: "open_saved_search", target: "PM Mumbai belt" });

    expect(result.kind).toBe("status");
    expect(result.ok).toBe(true);
    expect(result.spokenResponse).toContain("PM Mumbai belt");
    expect(result.spokenResponse).toContain("PM");
    expect(invoke).toHaveBeenCalledWith("open_in_chrome_profile", {
      url: "https://naukri.com/pm",
      profileDir: "Profile 1",
      debug: false,
    });
  });

  it("fuzzy matches by partial name", async () => {
    mockGetAllSavedSearches.mockResolvedValue([
      { id: "s1", name: "PM Mumbai belt", roleTag: "program manager", url: "https://naukri.com/pm", chromeProfileDir: "Profile 1", chromeProfileName: "PM", mode: "manual", resumePathOverride: null, created_at: 1 },
    ]);
    vi.mocked(invoke).mockResolvedValue("OK");

    const result = await executeAction({ action: "open_saved_search", target: "program manager" });

    expect(result.ok).toBe(true);
    expect(result.spokenResponse).toContain("PM Mumbai belt");
  });

  it("fuzzy matches by roleTag", async () => {
    mockGetAllSavedSearches.mockResolvedValue([
      { id: "s1", name: "Director Bangalore", roleTag: "director", url: "https://naukri.com/dir", chromeProfileDir: "Profile 2", chromeProfileName: "Director", mode: "manual", resumePathOverride: null, created_at: 1 },
    ]);
    vi.mocked(invoke).mockResolvedValue("OK");

    const result = await executeAction({ action: "open_saved_search", target: "director" });

    expect(result.ok).toBe(true);
    expect(result.spokenResponse).toContain("Director Bangalore");
  });

  it("returns not-found when no match", async () => {
    mockGetAllSavedSearches.mockResolvedValue([]);

    const result = await executeAction({ action: "open_saved_search", target: "nonexistent" });

    expect(result.ok).toBe(false);
    expect(result.spokenResponse).toContain("couldn't find");
  });

  it("speaks disambiguation on multiple matches", async () => {
    mockGetAllSavedSearches.mockResolvedValue([
      { id: "s1", name: "Director Bangalore", roleTag: "director", url: "https://naukri.com/dir-blr", chromeProfileDir: "Profile 2", chromeProfileName: "Director", mode: "manual", resumePathOverride: null, created_at: 1 },
      { id: "s2", name: "Director Pune", roleTag: "director", url: "https://naukri.com/dir-pune", chromeProfileDir: "Profile 2", chromeProfileName: "Director", mode: "manual", resumePathOverride: null, created_at: 2 },
    ]);

    const result = await executeAction({ action: "open_saved_search", target: "director" });

    expect(result.ok).toBeUndefined();
    expect(result.spokenResponse).toContain("2 matching");
    expect(result.spokenResponse).toContain("Director Bangalore");
    expect(result.spokenResponse).toContain("Director Pune");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("surfaces invoke errors gracefully", async () => {
    mockGetAllSavedSearches.mockResolvedValue([
      { id: "s1", name: "PM Mumbai belt", roleTag: "program-manager", url: "https://naukri.com/pm", chromeProfileDir: "Profile 1", chromeProfileName: "PM", mode: "manual", resumePathOverride: null, created_at: 1 },
    ]);
    vi.mocked(invoke).mockRejectedValue(new Error("Chrome not found"));

    const result = await executeAction({ action: "open_saved_search", target: "PM Mumbai belt" });

    expect(result.ok).toBe(false);
    expect(result.spokenResponse).toContain("couldn't open");
    expect(result.spokenResponse).toContain("Chrome not found");
  });
});

describe("executeAction — gmail (error propagation G-2)", () => {
  beforeEach(() => {
    mockGmailSearchRun.mockReset();
    mockGmailReadRun.mockReset();
    mockGmailListLabelsRun.mockReset();
    mockGmailSendRun.mockReset();
  });

  it("gmail_search surfaces real error on failure (not generic fallback)", async () => {
    mockGmailSearchRun.mockResolvedValue({
      success: false,
      error: "Gmail connection expired — reconnect in Settings, sir.",
    });

    const result = await executeAction({ action: "gmail_search", query: "meeting" });

    expect(result.ok).toBe(false);
    expect(result.spokenResponse).toContain("Gmail connection expired");
    expect(result.spokenResponse).not.toBe("I couldn't search Gmail.");
  });

  it("gmail_search shows tool error message", async () => {
    mockGmailSearchRun.mockResolvedValue({
      success: false,
      error: "Gmail API error (403): Access denied",
    });

    const result = await executeAction({ action: "gmail_search", query: "test" });

    expect(result.ok).toBe(false);
    expect(result.spokenResponse).toContain("Access denied");
  });

  it("gmail_read surfaces real error on failure", async () => {
    mockGmailReadRun.mockResolvedValue({
      success: false,
      error: "Gmail is not connected, sir — check Settings.",
    });

    const result = await executeAction({ action: "gmail_read", id: "123" });

    expect(result.ok).toBe(false);
    expect(result.spokenResponse).toContain("not connected");
  });

  it("gmail_list_labels surfaces real error on failure", async () => {
    mockGmailListLabelsRun.mockResolvedValue({
      success: false,
      error: "Gmail API error (500): Internal error",
    });

    const result = await executeAction({ action: "gmail_list_labels" });

    expect(result.ok).toBe(false);
    expect(result.spokenResponse).toContain("Internal error");
  });

  it("gmail_send surfaces real error on failure", async () => {
    mockGmailSendRun.mockResolvedValue({
      success: false,
      error: "Invalid recipient email: \"bad\"",
    });

    const result = await executeAction({
      action: "gmail_send", to: "bad", subject: "test", body: "hello",
    });

    expect(result.ok).toBe(false);
    expect(result.spokenResponse).toContain("Invalid recipient email");
  });

  it("gmail_send returns status kind on success", async () => {
    mockGmailSendRun.mockResolvedValue({
      success: true,
      output: "Email sent to a@b.com with subject \"Hello\".",
    });

    const result = await executeAction({
      action: "gmail_send", to: "a@b.com", subject: "Hello", body: "World",
    });

    expect(result.kind).toBe("status");
    expect(result.ok).toBe(true);
    expect(result.spokenResponse).toContain("Email sent");
  });

  it("gmail_recruiters returns answer kind with readable output", async () => {
    mockGetLastCheckAt.mockResolvedValue(Date.now() - 86400000);
    mockGmailFetchRecruiterCandidates.mockResolvedValue({
      candidates: [{ id: "m1", from: "hr@co.com", subject: "Job opening", snippet: "Hello" }],
      capHit: false,
      inboxFallback: false,
    });
    mockRunRecruiterRadar.mockResolvedValue({
      result: { outreach: [{ id: "m1", class: "recruiter_outreach", via: "direct" }], totalFetched: 1, capHit: false, degraded: false },
      newOutreach: [{ id: "m1", class: "recruiter_outreach", via: "direct" }],
      since: Date.now() - 86400000,
    });
    mockFormatRecruiterOutput.mockReturnValue("Priya from ABC about a role, sir.");

    const result = await executeAction({ action: "gmail_recruiters" });

    expect(result.kind).toBe("answer");
    expect(result.ok).toBe(true);
    expect(mockGmailFetchRecruiterCandidates).toHaveBeenCalled();
    expect(mockRunRecruiterRadar).toHaveBeenCalled();
    expect(result.spokenResponse).toContain("Priya from ABC");
    expect(result.spokenResponse).toContain('gmail_read with id "m1"');
  });

  it("gmail_recruiters returns error on fetch failure", async () => {
    mockGmailFetchRecruiterCandidates.mockRejectedValue(new Error("Gmail API down"));

    const result = await executeAction({ action: "gmail_recruiters" });

    expect(result.kind).toBe("answer");
    expect(result.ok).toBe(false);
    expect(result.spokenResponse).toContain("couldn't check recruiter mail");
    expect(result.errorDetail).toBe("Gmail API down");
  });

  it("gmail_recruiters with window_days passes windowDays to runRecruiterRadar", async () => {
    mockGetLastCheckAt.mockResolvedValue(Date.now() - 86400000);
    mockGmailFetchRecruiterCandidates.mockResolvedValue({
      candidates: [],
      capHit: false,
      inboxFallback: false,
    });

    const result = await executeAction({ action: "gmail_recruiters", window_days: 7 });

    expect(result.kind).toBe("answer");
    expect(result.ok).toBe(true);
    expect(result.spokenResponse).toContain("No recruiter emails");
  });
});

describe("resolveActionForConfirm — gmail_send and travel_time (G-4)", () => {
  it("gmail_send returns needsConfirmation with pendingResult", async () => {
    const result = await resolveActionForConfirm({
      action: "gmail_send", to: "a@b.com", subject: "Hello", body: "World",
    });

    expect(result.needsConfirmation).toBe(true);
    expect(result.pendingResult).toBeDefined();
    expect(result.pendingResult?.actionToResume).toBeDefined();
    const action = JSON.parse(result.pendingResult!.actionToResume!);
    expect(action.action).toBe("gmail_send");
    expect(action.to).toBe("a@b.com");
  });

  it("travel_time returns needsConfirmation with pendingResult", async () => {
    const result = await resolveActionForConfirm({
      action: "travel_time", from: "home", to: "work", mode: "car",
    });

    expect(result.needsConfirmation).toBe(true);
    expect(result.pendingResult).toBeDefined();
    expect(result.pendingResult?.actionToResume).toBeDefined();
    const action = JSON.parse(result.pendingResult!.actionToResume!);
    expect(action.action).toBe("travel_time");
    expect(action.from).toBe("home");
    expect(action.to).toBe("work");
  });

  it("travel_time preserves undefined from in actionToResume (defers GPS to executeAction)", async () => {
    const result = await resolveActionForConfirm({
      action: "travel_time", to: "work",
    });

    expect(result.needsConfirmation).toBe(true);
    expect(result.pendingResult?.actionToResume).toBeDefined();
    const action = JSON.parse(result.pendingResult!.actionToResume!);
    expect(action.from).toBeUndefined();
    expect(action.to).toBe("work");
    expect(result.spokenResponse).toContain("home");
  });

  it("travel_time unverified → confirm yes → executeAction still calls GPS", async () => {
    mockIsMobileDevice.mockReturnValue(true);
    mockGetCurrentPositionSafe.mockResolvedValue({ lat: 19.076, lng: 72.877 });
    mockTravelToolRun.mockResolvedValue({
      success: true,
      output: "By car it's about 22 minutes from your current location, sir.",
      data: {},
    });

    const confirmResult = await resolveActionForConfirm({
      action: "travel_time", to: "work", mode: "car",
    });

    const resumedAction = JSON.parse(confirmResult.pendingResult!.actionToResume!);
    const execResult = await executeAction(resumedAction, undefined, { preConfirmed: true });

    expect(mockGetCurrentPositionSafe).toHaveBeenCalledOnce();
    expect(mockTravelToolRun).toHaveBeenCalledWith(
      { from: "19.076,72.877", to: "work", mode: "car" },
      { vars: {} },
    );
    expect(execResult.ok).toBe(true);
  });

  it("open action still works without actionToResume", async () => {
    const result = await resolveActionForConfirm({
      action: "open", target: "https://example.com",
    });

    expect(result.needsConfirmation).toBe(true);
    expect(result.pendingResult?.target).toBe("https://example.com");
    expect(result.pendingResult?.actionToResume).toBeUndefined();
  });

  it("route_watch returns needsConfirmation with pendingResult", async () => {
    const result = await resolveActionForConfirm({
      action: "route_watch", from: "work", to: "home", mode: "car", threshold_minutes: 40,
    });

    expect(result.needsConfirmation).toBe(true);
    expect(result.pendingResult).toBeDefined();
    expect(result.pendingResult?.actionToResume).toBeDefined();
    const action = JSON.parse(result.pendingResult!.actionToResume!);
    expect(action.action).toBe("route_watch");
    expect(action.to).toBe("home");
  });
});

describe("detectPhantomSave", () => {
  const REMEMBER_CMD = "can you remember my home address is in Kanda colony sector 6";
  const REMEMBER_CMD_TYPO = "rember this as office adress -Plot No…";

  // Phantom saves observed verbatim in the failed T4 live test (2026-07-03):
  // save claim spoken, no remember action → must be caught.
  it('catches "Your home address is now saved" with no action', () => {
    expect(detectPhantomSave(REMEMBER_CMD, "Your home address is now saved", [])).toBe(true);
  });

  it('catches "Your office address is now saved" with no action', () => {
    expect(detectPhantomSave(REMEMBER_CMD, "Your office address is now saved", [])).toBe(true);
  });

  it('catches "Got it, sir. I\'ll save that for you." with no action', () => {
    expect(detectPhantomSave(REMEMBER_CMD, "Got it, sir. I'll save that for you.", [])).toBe(true);
  });

  it("catches a phantom save even when the user's remember word is misspelled", () => {
    expect(detectPhantomSave(REMEMBER_CMD_TYPO, "Your office address is now saved", [])).toBe(true);
  });

  // A real remember action present → NOT a phantom save (the save actually happens).
  it("does not fire when a remember action IS present", () => {
    const actions = [{ action: "remember", key: "home address", value: "123 Main St" } as const];
    expect(detectPhantomSave(REMEMBER_CMD, "I'll save that for you, sir.", actions)).toBe(false);
  });

  // False-positive guards: the save-word appears but the USER wasn't asking to remember.
  it('does not fire on "Ronaldo saved the match" when user did not ask to remember', () => {
    expect(detectPhantomSave("what a goal by Ronaldo", "Ronaldo saved the match", [])).toBe(false);
  });

  it("does not fire when there is no spoken text", () => {
    expect(detectPhantomSave(REMEMBER_CMD, "", [])).toBe(false);
  });

  // The intended correct model behavior — "Saving that now" alongside the action —
  // must NOT be flagged (present-tense "Saving" is not a completed-save claim).
  it('does not fire on "Saving that now" (present tense, not a completed-save claim)', () => {
    const actions = [{ action: "remember", key: "home address", value: "X" } as const];
    expect(detectPhantomSave(REMEMBER_CMD, "Saving that now, sir.", actions)).toBe(false);
    // even without an action, "Saving that now" is not a claimed-save phrase:
    expect(detectPhantomSave(REMEMBER_CMD, "Saving that now, sir.", [])).toBe(false);
  });

  // End-to-end through parseActions: phantom vs. grounded.
  it("end-to-end: claim without action block → phantom", () => {
    const { spokenText, actions } = parseActions("Your home address is now saved.");
    expect(detectPhantomSave(REMEMBER_CMD, spokenText, actions)).toBe(true);
  });

  it("end-to-end: claim WITH action block → not phantom", () => {
    const reply = "I'll save that for you, sir.\n```action\n{\"action\":\"remember\",\"key\":\"home address\",\"value\":\"123 Main St\"}\n```";
    const { spokenText, actions } = parseActions(reply);
    expect(detectPhantomSave(REMEMBER_CMD, spokenText, actions)).toBe(false);
  });
});
