export type RealtimeSessionState =
  | "idle"
  | "connecting"
  | "connected"
  | "speaking"
  | "disconnecting"
  | "error";

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
  temperature: number;
  maxResponseOutputTokens: number | "inf";
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
  temperature: 0.8,
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
  disconnectStart: number | undefined;
}
