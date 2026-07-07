import { describe, it, expect, vi } from "vitest";
import { SpeechQueue } from "@/lib/speech-queue";

describe("SpeechQueue", () => {
  function createQueue(delay = 5) {
    const spoken: string[] = [];
    const speakFn = vi.fn().mockImplementation(
      (text: string) =>
        new Promise<void>((resolve) => {
          spoken.push(text);
          setTimeout(resolve, delay);
        }),
    );
    const stopFn = vi.fn();
    const queue = new SpeechQueue(speakFn, stopFn);
    return { queue, speakFn, stopFn, spoken };
  }

  it("plays a single sentence", async () => {
    const { queue, spoken } = createQueue();
    queue.enqueue("Hello.");
    await queue.waitUntilDrained();
    expect(spoken).toEqual(["Hello."]);
  });

  it("plays multiple sentences in order", async () => {
    const { queue, spoken } = createQueue();
    queue.enqueue("First.");
    queue.enqueue("Second.");
    queue.enqueue("Third.");
    await queue.waitUntilDrained();
    expect(spoken).toEqual(["First.", "Second.", "Third."]);
  });

  it("waitUntilDrained resolves immediately when queue is empty", async () => {
    const { queue } = createQueue();
    await expect(queue.waitUntilDrained()).resolves.toBeUndefined();
  });

  it("fires onFirstAudio callback on first dequeue only", async () => {
    const { queue } = createQueue();
    const firstAudio = vi.fn();
    queue.onFirstAudio = firstAudio;
    queue.enqueue("First.");
    queue.enqueue("Second.");
    await queue.waitUntilDrained();
    expect(firstAudio).toHaveBeenCalledTimes(1);
  });

  it("stop clears pending sentences", async () => {
    const { queue, spoken } = createQueue(20);
    queue.enqueue("First.");
    queue.enqueue("Second.");
    queue.enqueue("Third.");
    // Wait a tick so First starts playing
    await new Promise((r) => setTimeout(r, 5));
    queue.stop();
    expect(spoken.length).toBeLessThan(3); // At least Third was dropped
  });

  it("stop calls the stopFn", async () => {
    const { queue, stopFn } = createQueue();
    queue.enqueue("Hello.");
    queue.stop();
    expect(stopFn).toHaveBeenCalledOnce();
  });

  it("drops enqueued sentences after stop", async () => {
    const { queue, spoken } = createQueue();
    queue.enqueue("Before.");
    queue.stop();
    queue.enqueue("After.");
    await queue.waitUntilDrained();
    expect(spoken).toEqual(["Before."]);
  });

  it("waitUntilDrained resolves immediately after stop", async () => {
    const { queue } = createQueue();
    queue.stop();
    await expect(queue.waitUntilDrained()).resolves.toBeUndefined();
  });

  it("reset clears stopped state for reuse", async () => {
    const { queue, spoken } = createQueue();
    queue.enqueue("First.");
    queue.stop();
    queue.reset();
    queue.enqueue("Second.");
    await queue.waitUntilDrained();
    expect(spoken).toEqual(["First.", "Second."]);
  });

  it("reports isSpeaking correctly", async () => {
    const { queue } = createQueue(50);
    expect(queue.isSpeaking).toBe(false);
    queue.enqueue("Hello.");
    expect(queue.isSpeaking).toBe(true);
    await queue.waitUntilDrained();
    expect(queue.isSpeaking).toBe(false);
  });

  it("reports length correctly", async () => {
    const { queue } = createQueue();
    expect(queue.length).toBe(0);
    queue.enqueue("A.");
    expect(queue.length).toBe(1);
    queue.enqueue("B.");
    expect(queue.length).toBe(2);
  });
});
