import type {
  RealtimeEvent,
  RealtimeTranscriptDelta,
  RealtimeTranscriptDone,
  RealtimeAudioDelta,
  RealtimeAudioDone,
  RealtimeSpeechStarted,
  RealtimeSpeechStopped,
  RealtimeInputTranscriptionCompleted,
  RealtimeResponseCreated,
  RealtimeResponseDone,
  RealtimeErrorEvent,
  RealtimeFunctionCallDelta,
  RealtimeFunctionCallDone,
  RealtimeConversationItemCreated,
  RealtimeResponseOutputItemDone,
  RealtimeSessionState,
  RealtimeEventBase,
} from "./realtime-types";

export function isTranscriptDelta(e: RealtimeEvent): e is RealtimeTranscriptDelta {
  return (
    e.type === "response.audio_transcript.delta" ||
    e.type === "response.output_audio_transcript.delta"
  );
}

export function isTranscriptDone(e: RealtimeEvent): e is RealtimeTranscriptDone {
  return (
    e.type === "response.audio_transcript.done" ||
    e.type === "response.output_audio_transcript.done"
  );
}

export function isAudioDelta(e: RealtimeEvent): e is RealtimeAudioDelta {
  return e.type === "response.audio.delta" || e.type === "response.output_audio.delta";
}

export function isAudioDone(e: RealtimeEvent): e is RealtimeAudioDone {
  return e.type === "response.audio.done" || e.type === "response.output_audio.done";
}

export function isSpeechStarted(e: RealtimeEvent): e is RealtimeSpeechStarted {
  return e.type === "input_audio_buffer.speech_started";
}

export function isSpeechStopped(e: RealtimeEvent): e is RealtimeSpeechStopped {
  return e.type === "input_audio_buffer.speech_stopped";
}

export function isUserTranscript(e: RealtimeEvent): e is RealtimeInputTranscriptionCompleted {
  return e.type === "conversation.item.input_audio_transcription.completed";
}

export function isResponseCreated(e: RealtimeEvent): e is RealtimeResponseCreated {
  return e.type === "response.created";
}

export function isResponseDone(e: RealtimeEvent): e is RealtimeResponseDone {
  return e.type === "response.done";
}

export function isErrorEvent(e: RealtimeEvent): e is RealtimeErrorEvent {
  return e.type === "error";
}

export function isFunctionCallDelta(e: RealtimeEvent): e is RealtimeFunctionCallDelta {
  return e.type === "response.function_call_arguments.delta";
}

export function isFunctionCallDone(e: RealtimeEvent): e is RealtimeFunctionCallDone {
  return e.type === "response.function_call_arguments.done";
}

export function isConversationItemCreated(e: RealtimeEvent): e is RealtimeConversationItemCreated {
  return e.type === "conversation.item.created";
}

export function isFunctionCallItem(e: RealtimeEvent): e is RealtimeConversationItemCreated {
  return isConversationItemCreated(e) && e.item?.type === "function_call";
}

export function isFunctionCallOutputItem(e: RealtimeEvent): e is RealtimeConversationItemCreated {
  return isConversationItemCreated(e) && e.item?.type === "function_call_output";
}

export function isResponseOutputItemDone(e: RealtimeEvent): e is RealtimeResponseOutputItemDone {
  return e.type === "response.output_item.done";
}

export const isUserTranscriptCompleted = isUserTranscript;
export const isValidStateTransition = canTransitionTo;

export const STATE_TRANSITIONS: Record<RealtimeSessionState, RealtimeSessionState[]> = {
  idle: ["connecting"],
  connecting: ["connected", "error", "idle"],
  connected: ["speaking", "disconnecting", "error", "offline", "idle"],
  speaking: ["connected", "disconnecting", "error", "offline", "idle"],
  disconnecting: ["idle", "error"],
  error: ["idle", "connecting"],
  offline: ["connected", "disconnecting", "error"],
};

export function canTransitionTo(
  from: RealtimeSessionState,
  to: RealtimeSessionState,
): boolean {
  return STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function createMockFunctionCallDelta(
  callId: string,
  delta: string,
): RealtimeFunctionCallDelta {
  return {
    type: "response.function_call_arguments.delta",
    delta,
    response_id: "mock-response",
    item_id: "mock-item",
    output_index: 0,
    call_id: callId,
  };
}

export function createMockFunctionCallDone(
  callId: string,
  name: string,
  args: string,
): RealtimeFunctionCallDone {
  return {
    type: "response.function_call_arguments.done",
    name,
    arguments: args,
    response_id: "mock-response",
    item_id: "mock-item",
    output_index: 0,
    call_id: callId,
  };
}

export function createMockConversationItem(
  type: "function_call" | "function_call_output",
  overrides: Record<string, unknown> = {},
): RealtimeConversationItemCreated {
  return {
    type: "conversation.item.created",
    item: {
      id: "mock-item",
      type,
      object: "realtime.item",
      ...overrides,
    },
  } as RealtimeConversationItemCreated;
}

export function parseRealtimeEvent(raw: string): RealtimeEvent | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.type === "string") {
      return parsed as RealtimeEvent;
    }
    return null;
  } catch {
    return null;
  }
}

export function extractTranscriptText(
  e: RealtimeEvent,
): string | undefined {
  if (isTranscriptDelta(e)) return e.delta;
  if (isTranscriptDone(e)) return e.transcript;
  if (isUserTranscript(e)) return e.transcript;
  return undefined;
}

export function extractAudioDelta(e: RealtimeEvent): string | undefined {
  if (isAudioDelta(e)) return e.delta;
  if (isAudioDone(e)) return e.delta;
  return undefined;
}

export function createMockTranscriptDelta(text: string): RealtimeTranscriptDelta {
  return {
    type: "response.audio_transcript.delta",
    delta: text,
    event_id: `evt_${Date.now()}`,
  };
}

export function createMockTranscriptDone(text: string): RealtimeTranscriptDone {
  return {
    type: "response.audio_transcript.done",
    transcript: text,
    event_id: `evt_${Date.now()}`,
  };
}

export function createMockAudioDelta(data: string): RealtimeAudioDelta {
  return {
    type: "response.audio.delta",
    delta: data,
    event_id: `evt_${Date.now()}`,
  };
}

export function createMockError(msg: string): RealtimeErrorEvent {
  return {
    type: "error",
    event_id: `evt_${Date.now()}`,
    error: {
      type: "mock_error",
      code: "MOCK_ERROR",
      message: msg,
      param: null,
      event_id: `evt_${Date.now()}`,
    },
  };
}

export function createMockUserTranscript(text: string): RealtimeInputTranscriptionCompleted {
  return {
    type: "conversation.item.input_audio_transcription.completed",
    transcript: text,
    item_id: "mock-item",
    content_index: 0,
  };
}

export function createMockResponseCreated(): RealtimeResponseCreated {
  return {
    type: "response.created",
    response: {},
  };
}

export function createMockResponseDone(): RealtimeResponseDone {
  return {
    type: "response.done",
    response: {},
  };
}

export function createMockSessionCreated(): RealtimeEventBase {
  return {
    type: "session.created",
    event_id: `evt_${Date.now()}`,
  };
}
