import { describe, it, expect } from "vitest";
import { deriveVoiceState, type VoiceStateInputs } from "@/lib/voice-state";
import type { AssistantStatus } from "@/types/assistant";

const ALL_STATUSES: AssistantStatus[] = ["idle", "listening", "thinking", "speaking", "confirming"];

const base: VoiceStateInputs = {
  status: "idle",
  vadPhase: "quiet",
  dictationRecording: false,
  dictationTranscribing: false,
  liveVoicePhase: "",
};

describe("deriveVoiceState", () => {
  it("returns idle when every input is at rest", () => {
    expect(deriveVoiceState(base)).toBe("idle");
  });

  // ── speaking — highest priority, Krishna's own voice always wins ──────────
  it("returns speaking when status is speaking", () => {
    expect(deriveVoiceState({ ...base, status: "speaking" })).toBe("speaking");
  });

  it("returns speaking when the live session is speaking", () => {
    expect(deriveVoiceState({ ...base, liveVoicePhase: "speaking" })).toBe("speaking");
  });

  it("speaking beats every other simultaneous signal", () => {
    expect(
      deriveVoiceState({
        status: "speaking",
        vadPhase: "speaking",
        dictationRecording: true,
        dictationTranscribing: true,
        liveVoicePhase: "connected",
      })
    ).toBe("speaking");
  });

  // ── thinking ────────────────────────────────────────────────────────────
  it("returns thinking when status is thinking", () => {
    expect(deriveVoiceState({ ...base, status: "thinking" })).toBe("thinking");
  });

  it("maps confirming to thinking, not listening or a stuck state", () => {
    expect(deriveVoiceState({ ...base, status: "confirming" })).toBe("thinking");
  });

  it("returns thinking while VAD is transcribing", () => {
    expect(deriveVoiceState({ ...base, vadPhase: "transcribing" })).toBe("thinking");
  });

  it("returns thinking while dictation is transcribing", () => {
    expect(deriveVoiceState({ ...base, dictationTranscribing: true })).toBe("thinking");
  });

  it("returns thinking while the live session is connecting", () => {
    expect(deriveVoiceState({ ...base, liveVoicePhase: "connecting" })).toBe("thinking");
  });

  it("thinking beats listening when both are true", () => {
    expect(
      deriveVoiceState({ ...base, status: "thinking", vadPhase: "speaking", dictationRecording: true })
    ).toBe("thinking");
  });

  // ── listening ───────────────────────────────────────────────────────────
  it("returns listening when VAD detects the user speaking", () => {
    expect(deriveVoiceState({ ...base, vadPhase: "speaking" })).toBe("listening");
  });

  it("returns listening while dictation is recording", () => {
    expect(deriveVoiceState({ ...base, dictationRecording: true })).toBe("listening");
  });

  it("returns listening when status is listening (unused today, but mapped for free)", () => {
    expect(deriveVoiceState({ ...base, status: "listening" })).toBe("listening");
  });

  it("returns listening when the live session is connected", () => {
    expect(deriveVoiceState({ ...base, liveVoicePhase: "connected" })).toBe("listening");
  });

  // ── idle / fallthrough ──────────────────────────────────────────────────
  it("returns idle while the live session is disconnecting", () => {
    expect(deriveVoiceState({ ...base, liveVoicePhase: "disconnecting" })).toBe("idle");
  });

  it("returns idle for an unrecognized liveVoicePhase value rather than getting stuck", () => {
    expect(deriveVoiceState({ ...base, liveVoicePhase: "some-future-phase" })).toBe("idle");
  });

  // ── exhaustive sweep — every AssistantStatus maps to something sane ────────
  it("every AssistantStatus produces a defined VoiceState with no other signals active", () => {
    for (const status of ALL_STATUSES) {
      const result = deriveVoiceState({ ...base, status });
      expect(["idle", "listening", "thinking", "speaking"]).toContain(result);
    }
  });
});
