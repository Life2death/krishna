import { describe, it, expect, vi, beforeEach } from "vitest";
import { SentenceStream } from "@/lib/sentence-stream";
import { SpeechQueue } from "@/lib/speech-queue";

function createFakeTTS(delay = 5) {
  const spoken: string[] = [];
  let currentResolve: (() => void) | null = null;

  const speak = vi.fn().mockImplementation(
    (text: string) =>
      new Promise<void>((resolve) => {
        spoken.push(text);
        currentResolve = resolve;
        setTimeout(resolve, delay);
      }),
  );
  const stop = vi.fn().mockImplementation(() => {
    currentResolve?.();
    currentResolve = null;
  });

  return { speak, stop, spoken };
}

describe("first-word-latency integration", () => {
  let flushSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    flushSpy = vi.fn();
  });

  it("streams sentences through queue in order", async () => {
    const tts = createFakeTTS();
    const queue = new SpeechQueue(tts.speak, tts.stop);
    const stream = new SentenceStream();

    const s1 = stream.addChunk("Hello. How are");
    expect(s1).toEqual(["Hello."]);
    for (const s of s1) queue.enqueue(s);

    const s2 = stream.addChunk(" you? I am fine.");
    expect(s2).toEqual(["How are you?"]);
    for (const s of s2) queue.enqueue(s);

    const remaining = stream.flush();
    expect(remaining).toEqual(["I am fine."]);
    for (const s of remaining) queue.enqueue(s);

    await queue.waitUntilDrained();
    expect(tts.spoken).toEqual(["Hello.", "How are you?", "I am fine."]);
    expect(tts.speak).toHaveBeenCalledTimes(3);
  });

  it("fires onFirstAudio on first enqueued sentence", async () => {
    const tts = createFakeTTS();
    const queue = new SpeechQueue(tts.speak, tts.stop);
    const onFirstAudio = vi.fn();
    queue.onFirstAudio = onFirstAudio;

    queue.enqueue("First.");
    queue.enqueue("Second.");
    await queue.waitUntilDrained();

    expect(onFirstAudio).toHaveBeenCalledOnce();
  });

  it("waitUntilDrained resolves only after all sentences play", async () => {
    const tts = createFakeTTS(10);
    const queue = new SpeechQueue(tts.speak, tts.stop);

    queue.enqueue("A.");
    queue.enqueue("B.");

    // Before draining, not all should be spoken yet
    expect(tts.spoken.length).toBeLessThanOrEqual(1);

    await queue.waitUntilDrained();
    expect(tts.spoken).toEqual(["A.", "B."]);
  });

  it("stop clears queue and stops current playback", async () => {
    const tts = createFakeTTS(20);
    const queue = new SpeechQueue(tts.speak, tts.stop);

    queue.enqueue("First.");
    queue.enqueue("Second.");
    queue.enqueue("Third.");

    // Let First start playing
    await new Promise((r) => setTimeout(r, 5));

    queue.stop();
    expect(tts.stop).toHaveBeenCalledOnce();
    expect(tts.spoken.length).toBeLessThan(3);

    // waitUntilDrained resolves immediately
    await expect(queue.waitUntilDrained()).resolves.toBeUndefined();
  });

  it("reset allows queue reuse after stop", async () => {
    const tts = createFakeTTS(5);
    const queue = new SpeechQueue(tts.speak, tts.stop);

    queue.enqueue("Before.");
    queue.stop();
    queue.reset();
    queue.enqueue("After.");

    await queue.waitUntilDrained();
    expect(tts.spoken).toEqual(["Before.", "After."]);
  });

  it("sentence-stream fills gap: cross-chunk decimal does not split", async () => {
    const stream = new SentenceStream();
    expect(stream.addChunk("The time is 3.")).toEqual([]);
    stream.addChunk("5pm sharp.");
    expect(stream.flush()).toEqual(["The time is 3.5pm sharp."]);
  });

  it("fence content is stripped from emitted sentences", async () => {
    const tts = createFakeTTS();
    const queue = new SpeechQueue(tts.speak, tts.stop);
    const stream = new SentenceStream();

    const s1 = stream.addChunk("Before. ```action\n{} ``` After.");
    expect(s1).toEqual(["Before."]);
    for (const s of s1) queue.enqueue(s);

    const remaining = stream.flush();
    expect(remaining).toEqual(["After."]);
    for (const s of remaining) queue.enqueue(s);

    await queue.waitUntilDrained();
    expect(tts.spoken).toEqual(["Before.", "After."]);
  });

  it("barge-in mid-queue stops further sentences", async () => {
    const tts = createFakeTTS(30);
    const queue = new SpeechQueue(tts.speak, tts.stop);

    queue.enqueue("A.");
    queue.enqueue("B.");
    queue.enqueue("C.");

    // Let A start playing, then barge-in
    await new Promise((r) => setTimeout(r, 10));
    queue.stop();

    expect(tts.spoken.length).toBeLessThan(3);
    expect(tts.stop).toHaveBeenCalledOnce();
  });
});
