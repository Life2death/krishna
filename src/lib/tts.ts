export interface TTSProvider {
  speak(text: string): Promise<void>;
  stop(): void;
  isSpeaking(): boolean;
  setVoice(voice: SpeechSynthesisVoice | null): void;
  setRate(rate: number): void;
  setPitch(pitch: number): void;
  getVoices(): SpeechSynthesisVoice[];
}

class BrowserTTS implements TTSProvider {
  private _voice: SpeechSynthesisVoice | null = null;
  private _rate = 1.0;
  private _pitch = 1.0;

  speak(text: string): Promise<void> {
    return new Promise((resolve) => {
      window.speechSynthesis.cancel();

      const cleaned = this.stripMarkdown(text);
      if (!cleaned.trim()) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.voice = this._voice;
      utterance.rate = this._rate;
      utterance.pitch = this._pitch;

      utterance.onend = () => {
        resolve();
      };
      utterance.onerror = () => {
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  stop(): void {
    window.speechSynthesis.cancel();
  }

  isSpeaking(): boolean {
    return window.speechSynthesis.speaking;
  }

  setVoice(voice: SpeechSynthesisVoice | null): void {
    this._voice = voice;
  }

  setRate(rate: number): void {
    this._rate = rate;
  }

  setPitch(pitch: number): void {
    this._pitch = pitch;
  }

  getVoices(): SpeechSynthesisVoice[] {
    return window.speechSynthesis.getVoices();
  }

  private stripMarkdown(text: string): string {
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
}

let ttsInstance: TTSProvider | null = null;

export function getTTS(): TTSProvider {
  if (!ttsInstance) {
    ttsInstance = new BrowserTTS();
  }
  return ttsInstance;
}
