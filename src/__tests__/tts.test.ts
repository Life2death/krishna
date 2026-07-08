import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserTTS, ElevenLabsTTS } from "@/lib/tts";

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

// ---------------------------------------------------------------------------
// ElevenLabs TTS
// ---------------------------------------------------------------------------
describe("ElevenLabsTTS", () => {
  let tts: ElevenLabsTTS;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    tts = new ElevenLabsTTS();
    tts.configure({ apiKey: "test-key", voiceId: "test-voice", modelId: "test-model" });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("supportsMse returns false in test environment", () => {
    expect((tts as any)._supportsMse()).toBe(false);
  });

  it("speak resolves immediately when no API key", async () => {
    const ttsNoKey = new ElevenLabsTTS();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(ttsNoKey.speak("hello")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("ElevenLabs TTS: no API key configured");
  });

  it("speak uses blob fallback when MSE is unavailable", async () => {
    const speakBlobSpy = vi.spyOn(tts as any, "_speakBlob").mockResolvedValue(undefined);
    await expect(tts.speak("hello world")).resolves.toBeUndefined();
    expect(speakBlobSpy).toHaveBeenCalledWith("hello world");
  });

  it("speak uses streaming endpoint when MSE is available", async () => {
    vi.spyOn(tts as any, "_supportsMse").mockReturnValue(true);
    const speakStreamingSpy = vi.spyOn(tts as any, "_speakStreaming").mockResolvedValue(undefined);
    await expect(tts.speak("hello world")).resolves.toBeUndefined();
    expect(speakStreamingSpy).toHaveBeenCalledWith("hello world");
  });

  it("blob fallback calls correct endpoint with expected body", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["data"], { type: "audio/mpeg" })),
      headers: new Headers({ "content-type": "audio/mpeg" }),
    });
    vi.spyOn(tts as any, "_speakBlob").mockRestore();

    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
      setTimeout(() => (this.onended as ((e: Event) => void) | null)?.(new Event("ended")), 5);
      return Promise.resolve();
    });

    await tts.speak("test");

    const url = (global.fetch as any).mock.calls[0][0];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/test-voice");
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.optimize_streaming_latency).toBeUndefined();
    expect(body.model_id).toBe("test-model");
    expect(body.voice_settings.similarity_boost).toBe(0.75);
  });

  it("streaming endpoint sends optimize_streaming_latency: 3 and /stream URL", async () => {
    const reader = vi.fn()
      .mockReturnValueOnce(Promise.resolve({ done: false, value: new Uint8Array([1, 2, 3]) }))
      .mockReturnValueOnce(Promise.resolve({ done: true, value: undefined }));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: reader } as unknown as ReadableStream<Uint8Array>,
      headers: new Headers({ "content-type": "audio/mpeg" }),
    });

    const mockSourceBuffer = {
      updating: false,
      appendBuffer: vi.fn(),
      addEventListener: vi.fn(),
    };

    let sourceOpenHandler: ((...args: any[]) => void) | null = null;
    const mockMediaSource = {
      readyState: "open",
      addSourceBuffer: vi.fn().mockReturnValue(mockSourceBuffer),
      endOfStream: vi.fn(),
      addEventListener: vi.fn((_event: string, handler: (...args: any[]) => void) => {
        sourceOpenHandler = handler;
      }),
    };

    vi.spyOn(tts as any, "_supportsMse").mockReturnValue(true);
    vi.stubGlobal("MediaSource", vi.fn(() => mockMediaSource));
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
      setTimeout(() => (this.onended as ((e: Event) => void) | null)?.(new Event("ended")), 5);
      return Promise.resolve();
    });

    const promise = tts.speak("test");
    (sourceOpenHandler as (() => void) | null)?.();
    await promise;

    const url = (global.fetch as any).mock.calls[0][0];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/test-voice/stream");
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.optimize_streaming_latency).toBe(3);
  });

  it("handles fetch error gracefully", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network failure"));
    await expect(tts.speak("hello")).resolves.toBeUndefined();
    expect(tts.isSpeaking()).toBe(false);
  });

  it("handles non-ok response gracefully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("rate limited"),
      headers: new Headers(),
    });
    await expect(tts.speak("hello")).resolves.toBeUndefined();
    expect(tts.isSpeaking()).toBe(false);
  });

  it("blob fallback resolves when play() rejects (regression: hang)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["data"], { type: "audio/mpeg" })),
      headers: new Headers({ "content-type": "audio/mpeg" }),
    });
    vi.spyOn(tts as any, "_speakBlob").mockRestore();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("autoplay blocked"));

    await expect(tts.speak("test")).resolves.toBeUndefined();
    expect(tts.isSpeaking()).toBe(false);
  });

  it("streaming resolves when play() rejects (regression: hang)", async () => {
    const reader = vi.fn()
      .mockReturnValueOnce(Promise.resolve({ done: false, value: new Uint8Array([1, 2, 3]) }))
      .mockReturnValueOnce(Promise.resolve({ done: true, value: undefined }));

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: reader } as unknown as ReadableStream<Uint8Array>,
      headers: new Headers({ "content-type": "audio/mpeg" }),
    });

    const mockSourceBuffer = {
      updating: false,
      appendBuffer: vi.fn(),
      addEventListener: vi.fn(),
    };

    let sourceOpenHandler: ((...args: any[]) => void) | null = null;
    const mockMediaSource = {
      readyState: "open",
      addSourceBuffer: vi.fn().mockReturnValue(mockSourceBuffer),
      endOfStream: vi.fn(),
      addEventListener: vi.fn((_event: string, handler: (...args: any[]) => void) => {
        sourceOpenHandler = handler;
      }),
    };

    vi.spyOn(tts as any, "_supportsMse").mockReturnValue(true);
    vi.stubGlobal("MediaSource", vi.fn(() => mockMediaSource));
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("autoplay blocked"));

    const promise = tts.speak("test");
    (sourceOpenHandler as (() => void) | null)?.();
    await expect(promise).resolves.toBeUndefined();
    expect(tts.isSpeaking()).toBe(false);
  });
});
