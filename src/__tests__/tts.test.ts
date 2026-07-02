import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserTTS } from "@/lib/tts";

function mockSpeechSynthesis() {
  let utteranceOnend: (() => void) | null = null;
  let utteranceOnerror: (() => void) | null = null;
  let currentlySpeaking = false;

  (window as any).SpeechSynthesisUtterance = vi.fn(function (this: any, text: string) {
    this.voice = null;
    this.rate = 1;
    this.pitch = 1;
    this.text = text;
    this.onend = null;
    this.onerror = null;
  });

  Object.defineProperty(window, "speechSynthesis", {
    value: {
      cancel: vi.fn(),
      speak: vi.fn(function (utterance: any) {
        currentlySpeaking = true;
        utteranceOnend = utterance.onend?.bind(utterance) ?? null;
        utteranceOnerror = utterance.onerror?.bind(utterance) ?? null;
      }),
      get speaking() {
        return currentlySpeaking;
      },
    },
    configurable: true,
    writable: true,
  });

  return {
    endSpeech: () => {
      currentlySpeaking = false;
      utteranceOnend?.();
      utteranceOnend = null;
    },
    errorSpeech: () => {
      currentlySpeaking = false;
      utteranceOnerror?.();
      utteranceOnerror = null;
    },
  };
}

describe("BrowserTTS", () => {
  let tts: BrowserTTS;
  let speech: ReturnType<typeof mockSpeechSynthesis>;

  beforeEach(() => {
    speech = mockSpeechSynthesis();
    tts = new BrowserTTS();
  });

  it("speak returns a promise that resolves on speech end", async () => {
    const promise = tts.speak("hello");
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
    speech.endSpeech();
    await expect(promise).resolves.toBeUndefined();
  });

  it("speak returns a promise that resolves on speech error", async () => {
    const promise = tts.speak("hello");
    speech.errorSpeech();
    await expect(promise).resolves.toBeUndefined();
  });

  it("calls cancel before speaking", async () => {
    const promise = tts.speak("hello");
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
    speech.endSpeech();
    await promise;
  });

  it("isSpeaking reflects speech state", async () => {
    expect(tts.isSpeaking()).toBe(false);
    const promise = tts.speak("hello");
    expect(window.speechSynthesis.speaking).toBe(true);
    expect(tts.isSpeaking()).toBe(true);
    speech.endSpeech();
    await promise;
    expect(window.speechSynthesis.speaking).toBe(false);
    expect(tts.isSpeaking()).toBe(false);
  });

  it("stop cancels speech", () => {
    tts.speak("hello");
    tts.stop();
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  });
});
