import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseActions, executeAction, resolveActionForConfirm, decideActionResponse, detectPhantomSave } from "@/lib/actions";
import { invoke } from "@tauri-apps/api/core";
import type { ExecuteActionResult } from "@/lib/actions";

const mockTravelToolRun = vi.hoisted(() => vi.fn());
const mockGmailSearchRun = vi.hoisted(() => vi.fn());
const mockGmailReadRun = vi.hoisted(() => vi.fn());
const mockGmailListLabelsRun = vi.hoisted(() => vi.fn());
const mockGmailSendRun = vi.hoisted(() => vi.fn());
const mockResolveTarget = vi.hoisted(() => vi.fn());

vi.mock("@krishna/core/tools/get-travel-time", () => ({
  getTravelTimeTool: {
    run: mockTravelToolRun,
  },
}));

vi.mock("@krishna/core/tools/gmail", () => ({
  gmailSearchMessagesTool: { run: mockGmailSearchRun },
  gmailReadMessageTool: { run: mockGmailReadRun },
  gmailListLabelsTool: { run: mockGmailListLabelsRun },
  gmailSendEmailTool: { run: mockGmailSendRun },
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

// ── detectPhantomSave (T4-F1 grounding) ──────────────────────────────────
// Tests the REAL exported helper (userCommand + spokenText + actions → boolean),
// not a re-declared regex — this is the layer the grounding logic actually runs at.

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
    expect(action.to).toBe("work");
  });

  it("open action still works without actionToResume", async () => {
    const result = await resolveActionForConfirm({
      action: "open", target: "https://example.com",
    });

    expect(result.needsConfirmation).toBe(true);
    expect(result.pendingResult?.target).toBe("https://example.com");
    expect(result.pendingResult?.actionToResume).toBeUndefined();
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
