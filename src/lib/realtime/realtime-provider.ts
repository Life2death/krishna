import type { RealtimeCallbacks } from "./realtime-client";
import { RealtimeClient } from "./realtime-client";
import { GeminiLiveClient } from "./gemini-live-client";
import type {
  RealtimeConfig,
  RealtimeTimingMarks,
  RealtimeSessionState,
  RealtimeFunctionDefinition,
} from "./realtime-types";

export type RealtimeProvider = "openai" | "gemini";

/**
 * Common surface used by LiveVoiceBar / LiveOrchestrator / LiveTurnLogger so the
 * OpenAI Realtime client and the Gemini Live client are interchangeable.
 */
export interface IRealtimeClient {
  config: RealtimeConfig;
  callbacks: RealtimeCallbacks;
  timing: RealtimeTimingMarks;
  readonly state: RealtimeSessionState;
  tools: RealtimeFunctionDefinition[];
  setCallbacks(cbs: RealtimeCallbacks): void;
  getTiming(): RealtimeTimingMarks;
  connect(apiKey?: string): Promise<void>;
  disconnect(): void;
  startRecording(stream: MediaStream): Promise<void>;
  stopRecording(): void;
  sendAudio(base64: string): void;
  commitAudio(): void;
  clearAudioBuffer(): void;
  cancelResponse(): void;
  bargeIn(): void;
  sendFunctionResponse(callId: string, output: string): void;
  continueResponse(): void;
  refreshActivity(): void;
  markToolExecuted(): void;
  getSessionDurationMs(): number;
  getSessionDurationFormatted(): string;
  getEstimatedCost(): string;
  getTranscriptHistory(): string[];
  resetTiming(): void;
}

export function createRealtimeClient(
  provider: RealtimeProvider,
  config?: Partial<RealtimeConfig>,
  callbacks: RealtimeCallbacks = {},
): IRealtimeClient {
  if (provider === "gemini") {
    return new GeminiLiveClient(config, callbacks);
  }
  return new RealtimeClient(config, callbacks);
}
