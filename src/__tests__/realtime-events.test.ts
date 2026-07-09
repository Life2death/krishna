import { describe, expect, it } from "vitest";
import {
  parseRealtimeEvent,
  isTranscriptDelta,
  isTranscriptDone,
  isAudioDelta,
  isAudioDone,
  isErrorEvent,
  isUserTranscriptCompleted,
  extractTranscriptText,
  extractAudioDelta,
  isValidStateTransition,
  createMockTranscriptDelta,
  createMockTranscriptDone,
  createMockAudioDelta,
  createMockError,
  createMockUserTranscript,
  createMockResponseCreated,
  createMockResponseDone,
  createMockSessionCreated,
} from "@/lib/realtime/realtime-events";
import type { RealtimeSessionState } from "@/lib/realtime/realtime-types";

describe("parseRealtimeEvent", () => {
  it("parses valid JSON event", () => {
    const event = parseRealtimeEvent(
      JSON.stringify({ type: "session.created", event_id: "evt_1" }),
    );
    expect(event).not.toBeNull();
    expect(event!.type).toBe("session.created");
    expect(event!.event_id).toBe("evt_1");
  });

  it("returns null for invalid JSON", () => {
    expect(parseRealtimeEvent("not json")).toBeNull();
  });

  it("returns null for JSON without type field", () => {
    expect(parseRealtimeEvent(JSON.stringify({ foo: "bar" }))).toBeNull();
  });

  it("parses transcript delta event", () => {
    const raw = {
      type: "response.audio_transcript.delta",
      event_id: "evt_delta",
      delta: "Hello ",
      response_id: "resp_1",
    };
    const event = parseRealtimeEvent(JSON.stringify(raw));
    expect(event).not.toBeNull();
    expect(event!.type).toBe("response.audio_transcript.delta");
  });

  it("parses current output audio transcript events", () => {
    const event = parseRealtimeEvent(
      JSON.stringify({
        type: "response.output_audio_transcript.delta",
        delta: "Hello ",
      }),
    );
    expect(event).not.toBeNull();
    expect(isTranscriptDelta(event!)).toBe(true);
    expect(extractTranscriptText(event!)).toBe("Hello ");
  });

  it("parses current output audio delta events", () => {
    const event = parseRealtimeEvent(
      JSON.stringify({
        type: "response.output_audio.delta",
        delta: "base64data",
      }),
    );
    expect(event).not.toBeNull();
    expect(isAudioDelta(event!)).toBe(true);
    expect(extractAudioDelta(event!)).toBe("base64data");
  });

  it("parses error event", () => {
    const raw = {
      type: "error",
      event_id: "evt_err",
      error: {
        type: "server_error",
        code: "INTERNAL_ERROR",
        message: "Something went wrong",
        param: null,
        event_id: "evt_err",
      },
    };
    const event = parseRealtimeEvent(JSON.stringify(raw));
    expect(event).not.toBeNull();
    expect(event!.type).toBe("error");
  });
});

describe("type guards", () => {
  it("isTranscriptDelta detects delta events", () => {
    const event = createMockTranscriptDelta("test");
    expect(isTranscriptDelta(event)).toBe(true);
    expect(isTranscriptDone(event)).toBe(false);
  });

  it("isTranscriptDone detects done events", () => {
    const event = createMockTranscriptDone("full text");
    expect(isTranscriptDone(event)).toBe(true);
    expect(isTranscriptDelta(event)).toBe(false);
  });

  it("isAudioDelta detects audio delta events", () => {
    const event = createMockAudioDelta("base64data");
    expect(isAudioDelta(event)).toBe(true);
    expect(isAudioDone(event)).toBe(false);
  });

  it("isErrorEvent detects error events", () => {
    const event = createMockError("test error");
    expect(isErrorEvent(event)).toBe(true);
  });

  it("isUserTranscriptCompleted detects user transcript events", () => {
    const event = createMockUserTranscript("user said something");
    expect(isUserTranscriptCompleted(event)).toBe(true);
  });
});

describe("extractTranscriptText", () => {
  it("extracts delta from transcript delta", () => {
    const event = createMockTranscriptDelta("Hello ");
    expect(extractTranscriptText(event)).toBe("Hello ");
  });

  it("extracts full transcript from transcript done", () => {
    const event = createMockTranscriptDone("Hello world");
    expect(extractTranscriptText(event)).toBe("Hello world");
  });

  it("extracts transcript from user transcript completed", () => {
    const event = createMockUserTranscript("user said");
    expect(extractTranscriptText(event)).toBe("user said");
  });

  it("returns undefined for unrelated events", () => {
    const event = createMockSessionCreated();
    expect(extractTranscriptText(event)).toBeUndefined();
  });
});

describe("extractAudioDelta", () => {
  it("extracts delta from audio delta", () => {
    const event = createMockAudioDelta("base64data");
    expect(extractAudioDelta(event)).toBe("base64data");
  });

  it("returns undefined for non-audio events", () => {
    const event = createMockTranscriptDelta("hello");
    expect(extractAudioDelta(event)).toBeUndefined();
  });
});

describe("isValidStateTransition", () => {
  const valid: [RealtimeSessionState, RealtimeSessionState][] = [
    ["idle", "connecting"],
    ["connecting", "connected"],
    ["connecting", "error"],
    ["connecting", "idle"],
    ["connected", "speaking"],
    ["connected", "disconnecting"],
    ["connected", "error"],
    ["connected", "idle"],
    ["speaking", "connected"],
    ["speaking", "disconnecting"],
    ["speaking", "error"],
    ["speaking", "idle"],
    ["disconnecting", "idle"],
    ["disconnecting", "error"],
    ["error", "idle"],
    ["error", "connecting"],
  ];

  const invalid: [RealtimeSessionState, RealtimeSessionState][] = [
    ["idle", "connected"],
    ["idle", "speaking"],
    ["idle", "disconnecting"],
    ["idle", "error"],
    ["connecting", "speaking"],
    ["connected", "connecting"],
    ["speaking", "connecting"],
    ["disconnecting", "connected"],
    ["disconnecting", "speaking"],
    ["disconnecting", "connecting"],
    ["error", "speaking"],
    ["error", "disconnecting"],
    ["error", "connected"],
  ];

  it.each(valid)("allows %s -> %s", (from, to) => {
    expect(isValidStateTransition(from, to)).toBe(true);
  });

  it.each(invalid)("rejects %s -> %s", (from, to) => {
    expect(isValidStateTransition(from, to)).toBe(false);
  });
});

describe("mock creators", () => {
  it("createMockTranscriptDelta builds correct shape", () => {
    const event = createMockTranscriptDelta("test ");
    expect(event.type).toBe("response.audio_transcript.delta");
    expect(event.delta).toBe("test ");
    expect(event.event_id).toBeDefined();
  });

  it("createMockTranscriptDone builds correct shape", () => {
    const event = createMockTranscriptDone("full transcript");
    expect(event.type).toBe("response.audio_transcript.done");
    expect(event.transcript).toBe("full transcript");
  });

  it("createMockAudioDelta builds correct shape", () => {
    const event = createMockAudioDelta("abcd1234");
    expect(event.type).toBe("response.audio.delta");
    expect(event.delta).toBe("abcd1234");
  });

  it("createMockError builds correct shape", () => {
    const event = createMockError("err msg");
    expect(event.type).toBe("error");
    expect(event.error.message).toBe("err msg");
    expect(event.error.code).toBe("MOCK_ERROR");
  });

  it("createMockUserTranscript builds correct shape", () => {
    const event = createMockUserTranscript("user text");
    expect(event.type).toBe(
      "conversation.item.input_audio_transcription.completed",
    );
    expect(event.transcript).toBe("user text");
  });

  it("createMockResponseCreated has correct type", () => {
    const event = createMockResponseCreated();
    expect(event.type).toBe("response.created");
  });

  it("createMockResponseDone has correct type", () => {
    const event = createMockResponseDone();
    expect(event.type).toBe("response.done");
  });

  it("createMockSessionCreated has correct type", () => {
    const event = createMockSessionCreated();
    expect(event.type).toBe("session.created");
  });
});
