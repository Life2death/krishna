import type {
  RealtimeEvent,
  RealtimeTranscriptDelta,
  RealtimeTranscriptDone,
  RealtimeAudioDelta,
  RealtimeAudioDone,
  RealtimeErrorEvent,
  RealtimeInputTranscriptionCompleted,
  RealtimeSessionCreated,
  RealtimeSessionState,
} from "./realtime-types";

export function parseRealtimeEvent(data: string): RealtimeEvent | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed.type === "string") {
      return parsed as RealtimeEvent;
    }
    return null;
  } catch {
    return null;
  }
}

export function isTranscriptDelta(
  event: RealtimeEvent,
): event is RealtimeTranscriptDelta {
  return (
    event.type === "response.audio_transcript.delta" ||
    event.type === "response.output_audio_transcript.delta"
  );
}

export function isTranscriptDone(
  event: RealtimeEvent,
): event is RealtimeTranscriptDone {
  return (
    event.type === "response.audio_transcript.done" ||
    event.type === "response.output_audio_transcript.done"
  );
}

export function isAudioDelta(
  event: RealtimeEvent,
): event is RealtimeAudioDelta {
  return (
    event.type === "response.audio.delta" ||
    event.type === "response.output_audio.delta"
  );
}

export function isAudioDone(
  event: RealtimeEvent,
): event is RealtimeAudioDone {
  return (
    event.type === "response.audio.done" ||
    event.type === "response.output_audio.done"
  );
}

export function isErrorEvent(
  event: RealtimeEvent,
): event is RealtimeErrorEvent {
  return event.type === "error";
}

export function isUserTranscriptCompleted(
  event: RealtimeEvent,
): event is RealtimeInputTranscriptionCompleted {
  return event.type === "conversation.item.input_audio_transcription.completed";
}

export function extractTranscriptText(
  event: RealtimeEvent,
): string | undefined {
  if (isTranscriptDelta(event)) return event.delta;
  if (isTranscriptDone(event)) return event.transcript;
  if (isUserTranscriptCompleted(event)) return event.transcript;
  return undefined;
}

export function extractAudioDelta(
  event: RealtimeEvent,
): string | undefined {
  if (isAudioDelta(event)) return event.delta;
  if (isAudioDone(event)) return event.delta;
  return undefined;
}

export function isValidStateTransition(
  current: RealtimeSessionState,
  next: RealtimeSessionState,
): boolean {
  const allowed: Record<RealtimeSessionState, RealtimeSessionState[]> = {
    idle: ["connecting"],
    connecting: ["connected", "error", "idle"],
    connected: ["speaking", "disconnecting", "error", "idle"],
    speaking: ["connected", "disconnecting", "error", "idle"],
    disconnecting: ["idle", "error"],
    error: ["idle", "connecting"],
  };
  return allowed[current]?.includes(next) ?? false;
}

export function createMockTranscriptDelta(
  delta: string,
): RealtimeTranscriptDelta {
  return {
    type: "response.audio_transcript.delta",
    event_id: crypto.randomUUID(),
    delta,
    response_id: "mock_resp",
    item_id: "mock_item",
    output_index: 0,
    content_index: 0,
  };
}

export function createMockTranscriptDone(
  transcript: string,
): RealtimeTranscriptDone {
  return {
    type: "response.audio_transcript.done",
    event_id: crypto.randomUUID(),
    transcript,
    response_id: "mock_resp",
    item_id: "mock_item",
    output_index: 0,
    content_index: 0,
  };
}

export function createMockAudioDelta(
  base64Audio: string,
): RealtimeAudioDelta {
  return {
    type: "response.audio.delta",
    event_id: crypto.randomUUID(),
    delta: base64Audio,
    response_id: "mock_resp",
    item_id: "mock_item",
    output_index: 0,
    content_index: 0,
  };
}

export function createMockError(message: string): RealtimeErrorEvent {
  return {
    type: "error",
    event_id: crypto.randomUUID(),
    error: {
      type: "mock_error",
      code: "MOCK_ERROR",
      message,
      param: null,
      event_id: crypto.randomUUID(),
    },
  };
}

export function createMockUserTranscript(
  transcript: string,
): RealtimeInputTranscriptionCompleted {
  return {
    type: "conversation.item.input_audio_transcription.completed",
    event_id: crypto.randomUUID(),
    transcript,
    item_id: "mock_item",
    content_index: 0,
  };
}

export function createMockResponseCreated(): RealtimeEvent {
  return {
    type: "response.created",
    event_id: crypto.randomUUID(),
  };
}

export function createMockResponseDone(): RealtimeEvent {
  return {
    type: "response.done",
    event_id: crypto.randomUUID(),
  };
}

export function createMockSessionCreated(): RealtimeSessionCreated {
  return {
    type: "session.created",
    event_id: crypto.randomUUID(),
    session: {
      id: "mock_session",
      model: "gpt-4o-realtime-preview",
      modalities: ["text", "audio"],
    },
  };
}
