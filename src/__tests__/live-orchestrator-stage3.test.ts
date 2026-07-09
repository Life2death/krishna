import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LiveOrchestrator, parseFastCommand } from "@/lib/realtime/live-orchestrator";
import { RealtimeClient } from "@/lib/realtime/realtime-client";
import type { RealtimeFunctionCallDone } from "@/lib/realtime/realtime-types";
import { DEFAULT_LIVE_VOICE_SETTINGS } from "@/lib/storage/live-voice-settings.storage";

function makeCall(overrides: Partial<RealtimeFunctionCallDone> = {}): RealtimeFunctionCallDone {
  return {
    type: "response.function_call_arguments.done",
    name: "web_search",
    arguments: '{"query":"test"}',
    response_id: "r1",
    item_id: "i1",
    output_index: 0,
    call_id: "c1",
    ...overrides,
  };
}

describe("LiveOrchestrator Stage 3", () => {
  let client: RealtimeClient;
  let orchestrator: LiveOrchestrator;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new RealtimeClient({
      inactivityTimeoutMs: 5000,
      maxSessionDurationMs: 60000,
    });
    vi.spyOn(client, "sendFunctionResponse").mockImplementation(() => {});
    vi.spyOn(client, "disconnect").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sensitive tool confirmation still works", async () => {
    const onConfirm = vi.fn();
    orchestrator = new LiveOrchestrator(client, { onConfirmationRequest: onConfirm });

    const call = makeCall({ name: "gmail_send_email", arguments: '{"to":"a@b.com","subject":"Hi","body":"Hello"}' });
    await orchestrator.interceptToolCall(call);

    expect(orchestrator.isPendingConfirmation).toBe(true);
    expect(onConfirm).toHaveBeenCalled();
  });

  it("fast command path still works", () => {
    const result = parseFastCommand("open youtube");
    expect(result).toEqual({ name: "open_target", args: { target: "youtube" } });
  });

  it("accepts settings in constructor and applies them", () => {
    const settings = {
      ...DEFAULT_LIVE_VOICE_SETTINGS,
      voice: "cedar",
      language: "hindi",
      inactivityTimeoutMs: 10000,
    };
    orchestrator = new LiveOrchestrator(client, { settings });
    expect((client as any).config.voice).toBe("cedar");
    expect((client as any).config.language).toBe("hindi");
    expect((client as any).config.inactivityTimeoutMs).toBe(10000);
  });

  it("getSessionDurationFormatted returns a valid duration string", () => {
    orchestrator = new LiveOrchestrator(client);
    const duration = orchestrator.getSessionDurationFormatted();
    expect(typeof duration).toBe("string");
    expect(duration).toMatch(/^\d{2}:\d{2}$/);
  });

  it("getEstimatedCostFormatted returns a cost string", () => {
    orchestrator = new LiveOrchestrator(client);
    const cost = orchestrator.getEstimatedCostFormatted();
    expect(typeof cost).toBe("string");
    expect(cost).toMatch(/^<?\$/);
  });

  it("updateSettings reapplies settings", () => {
    orchestrator = new LiveOrchestrator(client);
    const settings = {
      ...DEFAULT_LIVE_VOICE_SETTINGS,
      voice: "shimmer",
      language: "marathi",
    };
    orchestrator.updateSettings(settings);
    expect((client as any).config.voice).toBe("shimmer");
    expect((client as any).config.language).toBe("marathi");
  });

  it("handleOffline triggers fallback callback", () => {
    const onFallback = vi.fn();
    orchestrator = new LiveOrchestrator(client, { onFallbackToClassic: onFallback });

    orchestrator.handleOffline();

    expect(onFallback).toHaveBeenCalled();
  });
});
