import { sanitizeSpeech } from "./speech-sanitize";

export interface TTSProvider {
  speak(text: string): Promise<void>;
  stop(): void;
  isSpeaking(): boolean;
  setVoice(voice: SpeechSynthesisVoice | null): void;
  setRate(rate: number): void;
  setPitch(pitch: number): void;
  getVoices(): SpeechSynthesisVoice[];
}

// ---------------------------------------------------------------------------
// Browser TTS (Web Speech API)
// ---------------------------------------------------------------------------
export class BrowserTTS implements TTSProvider {
  private _voice: SpeechSynthesisVoice | null = null;
  private _rate = 1.0;
  private _pitch = 1.0;

  // The Android System WebView exposes no `window.speechSynthesis`. When it's
  // absent we route speech to the native Android TextToSpeech engine over a
  // Tauri command instead of silently doing nothing.
  private get hasWebSpeech(): boolean {
    return typeof window !== "undefined" && !!window.speechSynthesis;
  }

  speak(text: string): Promise<void> {
    const cleaned = sanitizeSpeech(text);
    if (!cleaned.trim()) return Promise.resolve();

    if (!this.hasWebSpeech) {
      // Native Android TTS: fire-and-forget (the engine queues utterances in
      // order), so resolve immediately — the frontend streams reply sentences
      // with real gaps, and QUEUE_ADD plays them sequentially.
      return import("@tauri-apps/api/core")
        .then(({ invoke }) => invoke("tts_speak_android", { text: cleaned }))
        .then(() => {})
        .catch((e) => {
          console.error("Native Android TTS failed:", e);
        });
    }

    return new Promise((resolve) => {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.voice = this._voice;
      utterance.rate = this._rate;
      utterance.pitch = this._pitch;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    if (!this.hasWebSpeech) {
      import("@tauri-apps/api/core")
        .then(({ invoke }) => invoke("tts_stop_android"))
        .catch(() => {});
      return;
    }
    window.speechSynthesis.cancel();
  }
  isSpeaking(): boolean { return this.hasWebSpeech ? window.speechSynthesis.speaking : false; }
  setVoice(voice: SpeechSynthesisVoice | null): void { this._voice = voice; }
  setRate(rate: number): void { this._rate = rate; }
  setPitch(pitch: number): void { this._pitch = pitch; }
  getVoices(): SpeechSynthesisVoice[] { return this.hasWebSpeech ? window.speechSynthesis.getVoices() : []; }
}

// ---------------------------------------------------------------------------
// ElevenLabs TTS
// ---------------------------------------------------------------------------
export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  preview_url: string;
}

export class ElevenLabsTTS implements TTSProvider {
  private apiKey = "";
  private voiceId = "21m00Tcm4TlvDq8ikWAM"; // Rachel — default premade
  private modelId = "eleven_turbo_v2_5";
  private _speaking = false;

  // Blob-fallback fields
  private audioEl: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;

  // MSE streaming fields
  private abortController: AbortController | null = null;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private streamAudioEl: HTMLAudioElement | null = null;

  configure(opts: { apiKey?: string; voiceId?: string; modelId?: string }) {
    if (opts.apiKey !== undefined) this.apiKey = opts.apiKey;
    if (opts.voiceId !== undefined) this.voiceId = opts.voiceId;
    if (opts.modelId !== undefined) this.modelId = opts.modelId;
  }

  speak(text: string): Promise<void> {
    return new Promise(async (resolve) => {
      try {
        this.stop();

        const cleaned = sanitizeSpeech(text);
        if (!cleaned.trim()) { resolve(); return; }

        if (!this.apiKey) {
          console.warn("ElevenLabs TTS: no API key configured");
          resolve();
          return;
        }

        if (this._supportsMse()) {
          await this._speakStreaming(cleaned);
        } else {
          await this._speakBlob(cleaned);
        }
      } catch (err) {
        this._speaking = false;
        this._cleanupAll();
        console.error("ElevenLabs TTS error:", err);
      } finally {
        resolve();
      }
    });
  }

  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = "";
      this.audioEl = null;
    }
    if (this.streamAudioEl) {
      this.streamAudioEl.pause();
      this.streamAudioEl.src = "";
      this.streamAudioEl = null;
    }
    if (this.mediaSource && this.mediaSource.readyState === "open") {
      try { this.mediaSource.endOfStream(); } catch { /* ok */ }
    }
    this._cleanupAll();
    this._speaking = false;
  }

  isSpeaking(): boolean { return this._speaking; }

  // Unused for ElevenLabs — voice is set via configure()
  setVoice(_voice: SpeechSynthesisVoice | null): void {}
  setRate(_rate: number): void {}
  setPitch(_pitch: number): void {}
  getVoices(): SpeechSynthesisVoice[] { return []; }

  private _supportsMse(): boolean {
    if (typeof MediaSource === "undefined") return false;
    return MediaSource.isTypeSupported("audio/mpeg");
  }

  private async _speakBlob(text: string): Promise<void> {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`ElevenLabs ${res.status}: ${errText}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    this.currentObjectUrl = url;

    const audio = new Audio(url);
    this.audioEl = audio;
    this._speaking = true;

    await new Promise<void>(async (resolvePlayback) => {
      audio.onended = () => {
        this._speaking = false;
        this._cleanupBlob();
        resolvePlayback();
      };
      audio.onerror = () => {
        this._speaking = false;
        this._cleanupBlob();
        resolvePlayback();
      };
      try {
        await audio.play();
      } catch {
        this._speaking = false;
        this._cleanupBlob();
        resolvePlayback();
      }
    });
  }

  private async _speakStreaming(text: string): Promise<void> {
    this.abortController = new AbortController();

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
          optimize_streaming_latency: 3,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
        signal: this.abortController.signal,
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`ElevenLabs ${res.status}: ${errText}`);
    }

    if (!res.body) throw new Error("ElevenLabs: streaming response has no body");

    const mimeType = res.headers.get("content-type") || "audio/mpeg";

    const mediaSource = new MediaSource();
    this.mediaSource = mediaSource;

    const audio = new Audio();
    this.streamAudioEl = audio;
    audio.src = URL.createObjectURL(mediaSource);

    this._speaking = true;

    const sourceBuffer = await new Promise<SourceBuffer>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("MediaSource sourceopen timed out"));
      }, 5000);

      mediaSource.addEventListener("sourceopen", () => {
        clearTimeout(timeoutId);
        try {
          const sb = mediaSource.addSourceBuffer(mimeType);
          resolve(sb);
        } catch (e) {
          reject(e);
        }
      }, { once: true });
    });

    this.sourceBuffer = sourceBuffer;

    let playbackResolve: (() => void) | null = null;
    const playbackPromise = new Promise<void>((resolve) => {
      playbackResolve = resolve;
      audio.onended = () => {
        this._speaking = false;
        this._cleanupStreaming();
        resolve();
      };
      audio.onerror = () => {
        this._speaking = false;
        this._cleanupStreaming();
        resolve();
      };
    });

    const reader = res.body.getReader();
    let firstChunkPlayed = false;

    const appendChunk = (chunk: Uint8Array): Promise<void> => {
      return new Promise((resolveAppend) => {
        const doAppend = () => {
          try {
            sourceBuffer.appendBuffer(chunk);
          } catch (e) {
            console.warn("ElevenLabs MSE appendBuffer error:", e);
          }
        };

        if (!sourceBuffer.updating) {
          doAppend();
          if (sourceBuffer.updating) {
            sourceBuffer.addEventListener("updateend", () => resolveAppend(), { once: true });
          } else {
            resolveAppend();
          }
        } else {
          sourceBuffer.addEventListener("updateend", () => {
            doAppend();
            if (sourceBuffer.updating) {
              sourceBuffer.addEventListener("updateend", () => resolveAppend(), { once: true });
            } else {
              resolveAppend();
            }
          }, { once: true });
        }
      });
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      await appendChunk(value);

      if (!firstChunkPlayed) {
        firstChunkPlayed = true;
        try {
          await audio.play();
        } catch {
          this._speaking = false;
          this._cleanupStreaming();
          (playbackResolve as (() => void) | null)?.();
          playbackResolve = null;
        }
      }
    }

    if (mediaSource.readyState === "open") {
      mediaSource.endOfStream();
    }

    await playbackPromise;
  }

  private _cleanupBlob(): void {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
    this.audioEl = null;
  }

  private _cleanupStreaming(): void {
    if (this.streamAudioEl) {
      this.streamAudioEl.src = "";
      this.streamAudioEl = null;
    }
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.abortController = null;
  }

  private _cleanupAll(): void {
    this._cleanupBlob();
    this._cleanupStreaming();
  }

  /** Fetch available voices from ElevenLabs API */
  async fetchVoices(): Promise<ElevenLabsVoice[]> {
    if (!this.apiKey) return [];
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": this.apiKey },
    });
    if (!res.ok) throw new Error(`ElevenLabs voices fetch failed: ${res.status}`);
    const data = await res.json();
    return (data.voices ?? []) as ElevenLabsVoice[];
  }
}

// ---------------------------------------------------------------------------
// Piper TTS — fully offline, free, local neural voice (no API key, no network)
// ---------------------------------------------------------------------------
export class PiperTTS implements TTSProvider {
  private _speaking = false;
  private audioCtx: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;

  speak(text: string): Promise<void> {
    return new Promise(async (resolve) => {
      try {
        this.stop();

        const cleaned = sanitizeSpeech(text);
        if (!cleaned.trim()) { resolve(); return; }

        const { invoke } = await import("@tauri-apps/api/core");
        const base64Wav = await invoke<string>("synthesize_speech_piper", { text: cleaned });

        const binary = atob(base64Wav);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        // Decode via Web Audio API rather than an <audio> element + blob URL —
        // decodeAudioData parses the WAV's own sample rate/channel layout directly
        // (Piper outputs 22050Hz mono), avoiding <audio> playback-engine quirks
        // with non-standard sample rates that can render as garbled/scratchy audio.
        if (!this.audioCtx) this.audioCtx = new AudioContext();
        if (this.audioCtx.state === "suspended") await this.audioCtx.resume();

        const audioBuffer = await this.audioCtx.decodeAudioData(bytes.buffer);

        const source = this.audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioCtx.destination);
        this.sourceNode = source;
        this._speaking = true;

        source.onended = () => {
          this._speaking = false;
          this.sourceNode = null;
          resolve();
        };

        source.start();
      } catch (err) {
        this._speaking = false;
        console.error("Piper TTS error:", err);
        resolve();
      }
    });
  }

  stop(): void {
    if (this.sourceNode) {
      try { this.sourceNode.stop(); } catch {}
      this.sourceNode = null;
    }
    this._speaking = false;
  }

  isSpeaking(): boolean { return this._speaking; }

  // Voice is fixed (bundled en_US-ryan-medium model) — no per-call voice/rate/pitch control yet
  setVoice(_voice: SpeechSynthesisVoice | null): void {}
  setRate(_rate: number): void {}
  setPitch(_pitch: number): void {}
  getVoices(): SpeechSynthesisVoice[] { return []; }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------
let browserTtsInstance: BrowserTTS | null = null;
let elevenlabsTtsInstance: ElevenLabsTTS | null = null;
let piperTtsInstance: PiperTTS | null = null;

export function getTTS(): BrowserTTS {
  if (!browserTtsInstance) browserTtsInstance = new BrowserTTS();
  return browserTtsInstance;
}

export function getElevenLabsTTS(): ElevenLabsTTS {
  if (!elevenlabsTtsInstance) elevenlabsTtsInstance = new ElevenLabsTTS();
  return elevenlabsTtsInstance;
}

export function getPiperTTS(): PiperTTS {
  if (!piperTtsInstance) piperTtsInstance = new PiperTTS();
  return piperTtsInstance;
}
