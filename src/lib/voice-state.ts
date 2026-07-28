import type { AssistantStatus } from "@/types/assistant";

/**
 * Presentation state for the collapsed overlay icon — deliberately narrower
 * than `AssistantStatus`. This drives spin speed + color on the small chakra
 * pill (see `CollapsedPill.tsx`), not the assistant's actual pipeline state.
 */
export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

/** Phase of the classic VAD mic pipeline, pushed up from `KrishnaVAD`. */
export type VadPhase = "quiet" | "speaking" | "transcribing";

export interface VoiceStateInputs {
  status: AssistantStatus;
  vadPhase: VadPhase;
  dictationRecording: boolean;
  dictationTranscribing: boolean;
  /** Realtime (Live Voice) session phase, pushed up from `LiveVoiceBar`.
   * Empty string when live mode is off. */
  liveVoicePhase: string;
}

/**
 * Derives one voice-state value from every real signal in the app, in strict
 * priority order (first match wins). Replaces the old imperative show/hide
 * presence-orb calls, which left the fullscreen orb stuck on screen whenever
 * a status transition (e.g. "confirming") fell through an unhandled branch —
 * this is a pure function of current state instead, so an unrecognized
 * combination always safely falls through to "idle" rather than getting
 * stuck on whatever was last shown.
 */
export function deriveVoiceState(inputs: VoiceStateInputs): VoiceState {
  const { status, vadPhase, dictationRecording, dictationTranscribing, liveVoicePhase } = inputs;

  // 1. Krishna's own voice always wins — never show "listening" while he's
  // actually talking.
  if (status === "speaking" || liveVoicePhase === "speaking") {
    return "speaking";
  }

  // 2. Anything that means "working on it, please wait".
  if (
    status === "thinking" ||
    status === "confirming" ||
    vadPhase === "transcribing" ||
    dictationTranscribing ||
    liveVoicePhase === "connecting"
  ) {
    return "thinking";
  }

  // 3. Anything that means "I can hear you talking right now".
  if (
    vadPhase === "speaking" ||
    dictationRecording ||
    status === "listening" ||
    liveVoicePhase === "connected"
  ) {
    return "listening";
  }

  // 4. Everything else, including a disconnecting live session.
  return "idle";
}
