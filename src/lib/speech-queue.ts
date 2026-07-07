export class SpeechQueue {
  private queue: string[] = [];
  private _speaking = false;
  private _stopped = false;
  private drainResolve: (() => void) | null = null;
  private firstAudioCalled = false;

  onFirstAudio: (() => void) | null = null;

  constructor(
    private speakFn: (text: string) => Promise<void>,
    private stopFn: () => void,
  ) {}

  enqueue(sentence: string): void {
    if (this._stopped) return;
    this.queue.push(sentence);
    if (!this._speaking) {
      this.processNext();
    }
  }

  stop(): void {
    this._stopped = true;
    this.queue = [];
    this.stopFn();
    this.resolveDrain();
  }

  reset(): void {
    this._stopped = false;
    this.firstAudioCalled = false;
    this.drainResolve = null;
  }

  waitUntilDrained(): Promise<void> {
    if (this._stopped || (!this._speaking && this.queue.length === 0)) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.drainResolve = resolve;
    });
  }

  get isSpeaking(): boolean {
    return this._speaking || this.queue.length > 0;
  }

  get length(): number {
    return this.queue.length + (this._speaking ? 1 : 0);
  }

  private async processNext(): Promise<void> {
    if (this._stopped) {
      this._speaking = false;
      this.resolveDrain();
      return;
    }
    if (this.queue.length === 0) {
      this._speaking = false;
      this.resolveDrain();
      return;
    }

    this._speaking = true;
    const text = this.queue.shift()!;

    if (!this.firstAudioCalled && this.onFirstAudio) {
      this.firstAudioCalled = true;
      this.onFirstAudio();
    }

    await this.speakFn(text);
    this.processNext();
  }

  private resolveDrain(): void {
    if (this.drainResolve) {
      const r = this.drainResolve;
      this.drainResolve = null;
      r();
    }
  }
}
