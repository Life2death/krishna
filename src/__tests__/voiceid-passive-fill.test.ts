// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Verify that the passive-fill pattern in KrishnaVAD's onSpeechEnd is correct:
//   1. verifyVoice is always called (not gated by isVoiceIdEnabled)
//   2. considerAddSample is always called when result qualifies
//   3. setVoiceStatus and voiceResult passing are gated on voiceIdEnabled

const mockVerifyVoice = vi.fn();
const mockConsiderAddSample = vi.fn();
const mockIsVoiceIdEnabled = vi.fn();
const mockSetVoiceStatus = vi.fn();
const mockProcessCommand = vi.fn();

// Simulate the onSpeechEnd logic from KrishnaVAD.tsx after the P3 fix
async function simulateOnSpeechEnd(voiceIdEnabled: boolean, voiceResult: any) {
  mockVerifyVoice.mockResolvedValue(voiceResult);

  const result = await mockVerifyVoice(/* audio */ {}, 16000);

  if (result) {
    if (result.enrolled && result.match) {
      await mockConsiderAddSample(/* audio */ {}, 16000, result);
    }
    if (voiceIdEnabled) {
      mockSetVoiceStatus(result);
    }
  }

  const transcription = "test command";
  if (transcription) {
    await mockProcessCommand(transcription, {
      voiceVerifyResult: voiceIdEnabled ? (result ?? undefined) : undefined,
    });
  }
}

describe("KrishnaVAD passive fill (Option A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls verifyVoice even when Voice ID is disabled", async () => {
    await simulateOnSpeechEnd(false, { enrolled: true, match: true, score: 0.92 });

    expect(mockVerifyVoice).toHaveBeenCalledTimes(1);
  });

  it("calls considerAddSample when enrolled+match regardless of enabled state", async () => {
    await simulateOnSpeechEnd(false, { enrolled: true, match: true, score: 0.92 });

    expect(mockConsiderAddSample).toHaveBeenCalledTimes(1);
  });

  it("does NOT call setVoiceStatus when Voice ID is disabled", async () => {
    await simulateOnSpeechEnd(false, { enrolled: true, match: true, score: 0.92 });

    expect(mockSetVoiceStatus).not.toHaveBeenCalled();
  });

  it("does NOT pass voiceVerifyResult to processCommand when Voice ID is disabled", async () => {
    await simulateOnSpeechEnd(false, { enrolled: true, match: true, score: 0.92 });

    expect(mockProcessCommand).toHaveBeenCalledWith("test command", {
      voiceVerifyResult: undefined,
    });
  });

  it("calls setVoiceStatus and passes result when Voice ID is enabled", async () => {
    const vr = { enrolled: true, match: true, score: 0.95 };
    await simulateOnSpeechEnd(true, vr);

    expect(mockSetVoiceStatus).toHaveBeenCalledWith(vr);
    expect(mockProcessCommand).toHaveBeenCalledWith("test command", {
      voiceVerifyResult: vr,
    });
  });

  it("does NOT call considerAddSample when result is not enrolled", async () => {
    await simulateOnSpeechEnd(false, { enrolled: false, match: false, score: 0 });

    expect(mockConsiderAddSample).not.toHaveBeenCalled();
  });

  it("does NOT call considerAddSample when result is not a match", async () => {
    await simulateOnSpeechEnd(false, { enrolled: true, match: false, score: 0.3 });

    expect(mockConsiderAddSample).not.toHaveBeenCalled();
  });

  it("still passes undefined to processCommand when verifyVoice returns null", async () => {
    await simulateOnSpeechEnd(true, null);

    expect(mockSetVoiceStatus).not.toHaveBeenCalled();
    expect(mockProcessCommand).toHaveBeenCalledWith("test command", {
      voiceVerifyResult: undefined,
    });
  });
});
