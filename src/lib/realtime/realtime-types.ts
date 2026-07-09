export type RealtimeSessionState =
  | "idle"
  | "connecting"
  | "connected"
  | "speaking"
  | "disconnecting"
  | "error"
  | "offline";

export interface RealtimeFunctionParameter {
  type: string;
  description: string;
  enum?: string[];
}

export interface RealtimeFunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, RealtimeFunctionParameter>;
    required: string[];
  };
}

export interface RealtimeConfig {
  model: string;
  instructions: string;
  voice: string;
  inputAudioFormat: "pcm16" | "g711_ulaw" | "g711_alaw";
  outputAudioFormat: "pcm16" | "g711_ulaw" | "g711_alaw";
  inputAudioTranscription: {
    model: string;
  };
  turnDetection: {
    type: "server_vad" | "none";
    threshold?: number;
    prefix_padding_ms?: number;
    silence_duration_ms?: number;
  };
  maxResponseOutputTokens: number | "inf";
  inactivityTimeoutMs?: number;
  maxSessionDurationMs?: number;
  pushToTalk?: boolean;
  localCommandsOnly?: boolean;
  language?: string;
}

export const DEFAULT_REALTIME_CONFIG: RealtimeConfig = {
  model: "gpt-realtime-2.1",
  instructions: "You are Krishna, an AI desktop assistant. Respond concisely in 1-2 sentences.",
  voice: "marin",
  inputAudioFormat: "pcm16",
  outputAudioFormat: "pcm16",
  inputAudioTranscription: { model: "gpt-4o-mini-transcribe" },
  turnDetection: {
    type: "server_vad",
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: 500,
  },
  maxResponseOutputTokens: "inf",
};

export interface RealtimeEventBase {
  type: string;
  event_id?: string;
}

export interface RealtimeSessionCreated extends RealtimeEventBase {
  type: "session.created";
  session: Record<string, unknown>;
}

export interface RealtimeResponseCreated extends RealtimeEventBase {
  type: "response.created";
  response: Record<string, unknown>;
}

export interface RealtimeResponseDone extends RealtimeEventBase {
  type: "response.done";
  response: Record<string, unknown>;
}

export interface RealtimeTranscriptDelta extends RealtimeEventBase {
  type: "response.audio_transcript.delta" | "response.output_audio_transcript.delta";
  delta: string;
  response_id?: string;
  item_id?: string;
  output_index?: number;
  content_index?: number;
}

export interface RealtimeTranscriptDone extends RealtimeEventBase {
  type: "response.audio_transcript.done" | "response.output_audio_transcript.done";
  transcript: string;
  response_id?: string;
  item_id?: string;
  output_index?: number;
  content_index?: number;
}

export interface RealtimeAudioDelta extends RealtimeEventBase {
  type: "response.audio.delta" | "response.output_audio.delta";
  delta: string;
  response_id?: string;
  item_id?: string;
  output_index?: number;
  content_index?: number;
}

export interface RealtimeAudioDone extends RealtimeEventBase {
  type: "response.audio.done" | "response.output_audio.done";
  delta?: string;
  response_id?: string;
  item_id?: string;
  output_index?: number;
  content_index?: number;
}

export interface RealtimeSpeechStarted extends RealtimeEventBase {
  type: "input_audio_buffer.speech_started";
  audio_start_ms: number;
  item_id: string;
}

export interface RealtimeSpeechStopped extends RealtimeEventBase {
  type: "input_audio_buffer.speech_stopped";
  audio_end_ms: number;
  item_id: string;
}

export interface RealtimeInputTranscriptionCompleted extends RealtimeEventBase {
  type: "conversation.item.input_audio_transcription.completed";
  transcript: string;
  item_id?: string;
  content_index?: number;
}

export interface RealtimeFunctionCallDelta extends RealtimeEventBase {
  type: "response.function_call_arguments.delta";
  delta: string;
  response_id: string;
  item_id: string;
  output_index: number;
  call_id: string;
}

export interface RealtimeFunctionCallDone extends RealtimeEventBase {
  type: "response.function_call_arguments.done";
  name: string;
  arguments: string;
  response_id: string;
  item_id: string;
  output_index: number;
  call_id: string;
}

export interface RealtimeConversationItemCreated extends RealtimeEventBase {
  type: "conversation.item.created";
  previous_item_id?: string;
  item: {
    id: string;
    type: string;
    object: string;
    status?: string;
    name?: string;
    arguments?: string;
    call_id?: string;
    output?: string;
    role?: string;
    content?: unknown[];
  };
}

export interface RealtimeResponseOutputItemDone extends RealtimeEventBase {
  type: "response.output_item.done";
  response_id: string;
  output_index: number;
  item: {
    id: string;
    type: string;
    object: string;
    status?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
  };
}

export interface RealtimeErrorEvent extends RealtimeEventBase {
  type: "error";
  error: {
    type: string;
    code: string;
    message: string;
    param: unknown;
    event_id: string;
  };
}

export type RealtimeEvent =
  | RealtimeSessionCreated
  | RealtimeResponseCreated
  | RealtimeResponseDone
  | RealtimeTranscriptDelta
  | RealtimeTranscriptDone
  | RealtimeAudioDelta
  | RealtimeAudioDone
  | RealtimeSpeechStarted
  | RealtimeSpeechStopped
  | RealtimeInputTranscriptionCompleted
  | RealtimeFunctionCallDelta
  | RealtimeFunctionCallDone
  | RealtimeConversationItemCreated
  | RealtimeResponseOutputItemDone
  | RealtimeErrorEvent
  | RealtimeEventBase;

export interface RealtimeTimingMarks {
  connectStart: number;
  connectedAt: number | undefined;
  firstTranscriptDelta: number | undefined;
  firstAudioDelta: number | undefined;
  firstUserTranscript: number | undefined;
  responseCreated: number | undefined;
  responseDone: number | undefined;
  toolCallReceived: number | undefined;
  toolExecuted: number | undefined;
  disconnectStart: number | undefined;
  sessionStartTime: number | undefined;
  lastActivityTime: number | undefined;
  inactivityFiredAt: number | undefined;
  totalUserSpeechMs: number;
  totalAssistantSpeechMs: number;
}
