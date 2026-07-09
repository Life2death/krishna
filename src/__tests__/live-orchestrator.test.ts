import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveOrchestrator, parseFastCommand } from "@/lib/realtime/live-orchestrator";
import { RealtimeClient } from "@/lib/realtime/realtime-client";
import type { RealtimeFunctionCallDone } from "@/lib/realtime/realtime-types";

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

describe("LiveOrchestrator", () => {
  let client: RealtimeClient;
  let orchestrator: LiveOrchestrator;

  beforeEach(() => {
    client = new RealtimeClient();
    vi.spyOn(client, "sendFunctionResponse").mockImplementation(() => {});
  });

  it("creates with default options", () => {
    orchestrator = new LiveOrchestrator(client);
    expect(orchestrator.isPendingConfirmation).toBe(false);
  });

  it("interceptToolCall executes safe tools immediately", async () => {
    const onStart = vi.fn();
    orchestrator = new LiveOrchestrator(client, { onToolCallStart: onStart });

    const call = makeCall({ name: "web_search" });
    await orchestrator.interceptToolCall(call);

    expect(onStart).toHaveBeenCalledWith("web_search", { query: "test" });
    expect(client.sendFunctionResponse).toHaveBeenCalled();
  });

  it("interceptToolCall blocks sensitive tools for confirmation", async () => {
    const onConfirm = vi.fn();
    orchestrator = new LiveOrchestrator(client, { onConfirmationRequest: onConfirm });

    const call = makeCall({ name: "gmail_send_email", arguments: '{"to":"a@b.com","subject":"Hi","body":"Hello"}' });
    await orchestrator.interceptToolCall(call);

    expect(orchestrator.isPendingConfirmation).toBe(true);
    expect(orchestrator.pending?.name).toBe("gmail_send_email");
    expect(onConfirm).toHaveBeenCalled();
    expect(client.sendFunctionResponse).toHaveBeenCalledWith(
      "c1",
      expect.stringContaining("needs_confirmation"),
    );
  });

  it("handleUserTranscript confirms pending action on yes", async () => {
    const onConfirmResult = vi.fn();
    orchestrator = new LiveOrchestrator(client, { onConfirmationResult: onConfirmResult });

    const call = makeCall({ name: "gmail_send_email", arguments: '{"to":"a@b.com","subject":"Hi","body":"Hello"}' });
    await orchestrator.interceptToolCall(call);
    expect(orchestrator.isPendingConfirmation).toBe(true);

    orchestrator.handleUserTranscript("yes");
    expect(onConfirmResult).toHaveBeenCalledWith("gmail_send_email", true);
    expect(orchestrator.isPendingConfirmation).toBe(false);
  });

  it("handleUserTranscript declines pending action on no", async () => {
    const onConfirmResult = vi.fn();
    orchestrator = new LiveOrchestrator(client, { onConfirmationResult: onConfirmResult });

    const call = makeCall({ name: "gmail_send_email" });
    await orchestrator.interceptToolCall(call);
    expect(orchestrator.isPendingConfirmation).toBe(true);

    orchestrator.handleUserTranscript("no");
    expect(onConfirmResult).toHaveBeenCalledWith("gmail_send_email", false);
    expect(orchestrator.isPendingConfirmation).toBe(false);
    expect(client.sendFunctionResponse).toHaveBeenLastCalledWith(
      "c1",
      expect.stringContaining("cancelled"),
    );
  });

  it("handleUserTranscript does nothing for ambiguous when pending", async () => {
    orchestrator = new LiveOrchestrator(client);

    const call = makeCall({ name: "gmail_send_email" });
    await orchestrator.interceptToolCall(call);

    orchestrator.handleUserTranscript("maybe later");
    expect(orchestrator.isPendingConfirmation).toBe(true);
  });

  it("handleOffline changes state to offline", () => {
    const onState = vi.fn();
    client.callbacks.onStateChange = onState;

    orchestrator = new LiveOrchestrator(client);
    orchestrator.handleOffline();

    expect(onState).toHaveBeenCalledWith("offline");
  });

  it("handleBackOnline clears pending action and fires sensitive blocked", async () => {
    const onBlocked = vi.fn();
    orchestrator = new LiveOrchestrator(client, { onSensitiveBlocked: onBlocked });

    const call = makeCall({ name: "gmail_send_email" });
    await orchestrator.interceptToolCall(call);
    expect(orchestrator.isPendingConfirmation).toBe(true);

    orchestrator.handleBackOnline();
    expect(onBlocked).toHaveBeenCalledWith("gmail_send_email", expect.any(Object));
    expect(orchestrator.isPendingConfirmation).toBe(false);
  });
});

describe("parseFastCommand", () => {
  it("parses open command", () => {
    const result = parseFastCommand("open youtube");
    expect(result).toEqual({ name: "open_target", args: { target: "youtube" } });
  });

  it("parses launch command", () => {
    const result = parseFastCommand("launch chrome");
    expect(result).toEqual({ name: "open_target", args: { target: "chrome" } });
  });

  it("parses start command", () => {
    const result = parseFastCommand("start spotify");
    expect(result).toEqual({ name: "open_target", args: { target: "spotify" } });
  });

  it("parses focus command", () => {
    const result = parseFastCommand("focus terminal");
    expect(result).toEqual({ name: "control_window", args: { target: "terminal", mode: "focus" } });
  });

  it("parses bring command", () => {
    const result = parseFastCommand("bring browser");
    expect(result).toEqual({ name: "control_window", args: { target: "browser", mode: "focus" } });
  });

  it("parses switch to command", () => {
    const result = parseFastCommand("switch to vscode");
    expect(result).toEqual({ name: "control_window", args: { target: "vscode", mode: "focus" } });
  });

  it("returns null for non-matching text", () => {
    expect(parseFastCommand("what is the weather")).toBeNull();
    expect(parseFastCommand("tell me a joke")).toBeNull();
    expect(parseFastCommand("")).toBeNull();
  });
});
