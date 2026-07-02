export type TimingMark =
  | "end_of_speech"
  | "request_sent"
  | "first_token"
  | "last_token"
  | "first_audio"
  | "last_audio";

export interface TurnTimingData {
  marks: Partial<Record<TimingMark, number>>;
  deltas: {
    stt_to_send?: number;
    send_to_first_token?: number;
    first_token_to_first_audio?: number;
    first_audio_to_last_audio?: number;
    first_token_to_last_token?: number;
    total?: number;
  };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export class TurnTiming {
  private _marks: Partial<Record<TimingMark, number>> = {};
  private _frozen = false;
  private _usage?: { prompt_tokens?: number; completion_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };

  mark(name: TimingMark): void {
    if (this._frozen) return;
    if (this._marks[name] !== undefined) return;
    this._marks[name] = performance.now();
  }

  setUsage(usage: { prompt_tokens?: number; completion_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }): void {
    this._usage = usage;
  }

  get marks(): Partial<Record<TimingMark, number>> {
    return { ...this._marks };
  }

  private delta(from: TimingMark, to: TimingMark): number | undefined {
    const a = this._marks[from];
    const b = this._marks[to];
    if (a !== undefined && b !== undefined) return Math.round(b - a);
    return undefined;
  }

  toData(): TurnTimingData {
    return {
      marks: { ...this._marks },
      deltas: {
        stt_to_send: this.delta("end_of_speech", "request_sent"),
        send_to_first_token: this.delta("request_sent", "first_token"),
        first_token_to_first_audio: this.delta("first_token", "first_audio"),
        first_audio_to_last_audio: this.delta("first_audio", "last_audio"),
        first_token_to_last_token: this.delta("first_token", "last_token"),
        total: this.delta("end_of_speech", "last_audio"),
      },
      ...(this._usage ? { usage: this._usage } : {}),
    };
  }

  toJSON(): string {
    return JSON.stringify(this.toData());
  }

  static fromJSON(json: string): TurnTimingData | null {
    try {
      return JSON.parse(json) as TurnTimingData;
    } catch {
      return null;
    }
  }

  freeze(): void {
    this._frozen = true;
  }
}
