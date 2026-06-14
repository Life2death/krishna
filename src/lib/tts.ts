export interface TTSProvider {
  speak(text: string): Promise<void>;
  stop(): void;
  isSpeaking(): boolean;
  setVoice(voice: SpeechSynthesisVoice | null): void;
  setRate(rate: number): void;
  setPitch(pitch: number): void;
  getVoices(): SpeechSynthesisVoice[];
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/>\s/g, "")
    .replace(/```action\n[\s\S]*?\n```/g, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Browser TTS (Web Speech API)
// ---------------------------------------------------------------------------
export class BrowserTTS implements TTSProvider {
  private _voice: SpeechSynthesisVoice | null = null;
  private _rate = 1.0;
  private _pitch = 1.0;

  speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();

      const cleaned = stripMarkdown(text);
      if (!cleaned.trim()) { resolve(); return; }

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.voice = this._voice;
      utterance.rate = this._rate;
      utterance.pitch = this._pitch;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    });
  }

  stop(): void { window.speechSynthesis.cancel(); }
  isSpeaking(): boolean { return window.speechSynthesis.speaking; }
  setVoice(voice: SpeechSynthesisVoice | null): void { this._voice = voice; }
  setRate(rate: number): void { this._rate = rate; }
  setPitch(pitch: number): void { this._pitch = pitch; }
  getVoices(): SpeechSynthesisVoice[] { return window.speechSynthesis.getVoices(); }
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
  private audioEl: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;

  configure(opts: { apiKey?: string; voiceId?: string; modelId?: string }) {
    if (opts.apiKey !== undefined) this.apiKey = opts.apiKey;
    if (opts.voiceId !== undefined) this.voiceId = opts.voiceId;
    if (opts.modelId !== undefined) this.modelId = opts.modelId;
  }

  speak(text: string): Promise<void> {
    return new Promise(async (resolve) => {
      try {
        this.stop();

        const cleaned = stripMarkdown(text);
        if (!cleaned.trim()) { resolve(); return; }

        if (!this.apiKey) {
          console.warn("ElevenLabs TTS: no API key configured");
          resolve();
          return;
        }

        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
          {
            method: "POST",
            headers: {
              "xi-api-key": this.apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text: cleaned,
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

        audio.onended = () => {
          this._speaking = false;
          this._cleanup();
          resolve();
        };
        audio.onerror = () => {
          this._speaking = false;
          this._cleanup();
          resolve();
        };

        await audio.play();
      } catch (err) {
        this._speaking = false;
        this._cleanup();
        console.error("ElevenLabs TTS error:", err);
        resolve();
      }
    });
  }

  stop(): void {
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = "";
      this.audioEl = null;
    }
    this._cleanup();
    this._speaking = false;
  }

  isSpeaking(): boolean { return this._speaking; }

  // Unused for ElevenLabs — voice is set via configure()
  setVoice(_voice: SpeechSynthesisVoice | null): void {}
  setRate(_rate: number): void {}
  setPitch(_pitch: number): void {}
  getVoices(): SpeechSynthesisVoice[] { return []; }

  private _cleanup() {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
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
// Singletons
// ---------------------------------------------------------------------------
let browserTtsInstance: BrowserTTS | null = null;
let elevenlabsTtsInstance: ElevenLabsTTS | null = null;

export function getTTS(): BrowserTTS {
  if (!browserTtsInstance) browserTtsInstance = new BrowserTTS();
  return browserTtsInstance;
}

export function getElevenLabsTTS(): ElevenLabsTTS {
  if (!elevenlabsTtsInstance) elevenlabsTtsInstance = new ElevenLabsTTS();
  return elevenlabsTtsInstance;
}
