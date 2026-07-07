const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs",
  "etc", "eg", "ie", "approx", "dept", "est", "govt", "inc",
  "ltd", "co", "corp", "gen", "sgt", "capt", "lt", "col", "maj",
  "rep", "sen", "gov", "pres", "vice",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
  "ave", "blvd", "rd", "ln", "ct",
]);

const SENTENCE_END = new Set([".", "!", "?", "\u0964"]);

export class SentenceStream {
  private buffer = "";
  private _insideFence = false;

  addChunk(chunk: string): string[] {
    this.buffer += chunk;
    return this.emitSentences();
  }

  flush(): string[] {
    if (this._insideFence || this.buffer.length === 0) return [];
    const remaining = this.buffer.trim();
    this.buffer = "";
    return remaining.length > 0 ? [remaining] : [];
  }

  get isInsideFence(): boolean {
    return this._insideFence;
  }

  private emitSentences(): string[] {
    const sentences: string[] = [];
    let sentenceStart = 0;
    let i = 0;

    while (i < this.buffer.length) {
      if (
        this.buffer[i] === "`" &&
        this.buffer[i + 1] === "`" &&
        this.buffer[i + 2] === "`"
      ) {
        this._insideFence = !this._insideFence;
        sentenceStart = i + 3;
        i += 3;
        continue;
      }

      const ch = this.buffer[i];
      if (SENTENCE_END.has(ch) && !this._insideFence && this.isValidBoundary(i)) {
        const sentence = this.buffer.slice(sentenceStart, i + 1).trim();
        if (sentence.length > 0) {
          sentences.push(sentence);
        }
        sentenceStart = i + 1;
      }

      i++;
    }

    this.buffer = this.buffer.slice(sentenceStart);
    return sentences;
  }

  private isValidBoundary(pos: number): boolean {
    const ch = this.buffer[pos];

    if (ch === "\u0964") return true;

    if (pos + 1 < this.buffer.length && !/\s/.test(this.buffer[pos + 1])) {
      return false;
    }

    if (ch !== ".") return true;

    if (pos + 1 >= this.buffer.length) return false;

    let wordStart = pos;
    while (wordStart > 0 && !/\s/.test(this.buffer[wordStart - 1])) {
      wordStart--;
    }
    const preceding = this.buffer.slice(wordStart, pos).toLowerCase();

    if (ABBREVIATIONS.has(preceding)) return false;

    if (preceding.length === 1 && /[a-z]/i.test(preceding)) return false;

    return true;
  }
}

export function isInsideFence(text: string): boolean {
  const matches = text.match(/```/g);
  if (!matches) return false;
  return matches.length % 2 !== 0;
}

export function stripActionFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "").trim();
}
