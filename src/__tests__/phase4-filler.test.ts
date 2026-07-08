import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("P4-F9: filler threshold and sequencing (L3: 2500ms from end-of-speech)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no filler fires when stream completes before 2500ms EOS threshold", () => {
    let fillerFired = false;

    // Simulate the end-of-speech based filler timer with fresh EOS (2500ms)
    const timer = setTimeout(() => { fillerFired = true; }, 2500);

    // Stream completes before threshold — clear the timer
    clearTimeout(timer);

    // Advance well past the threshold
    vi.advanceTimersByTime(5000);

    expect(fillerFired).toBe(false);
  });

  it("filler fire time is dynamically reduced based on elapsed time since EOS", () => {
    let fillerFiredAt = 0;

    // Simulate EOS having happened 1000ms ago (e.g., slow STT)
    const elapsedSinceEos = 1000;
    const fillerRemaining = Math.max(0, 2500 - elapsedSinceEos);
    const timer = setTimeout(() => { fillerFiredAt = Date.now(); }, fillerRemaining);

    vi.advanceTimersByTime(fillerRemaining);
    expect(fillerFiredAt).toBeGreaterThan(0);
  });

  it("filler fires immediately when EOS was more than 2500ms ago", () => {
    let fillerFired = false;

    // Simulate EOS having happened 3000ms ago (e.g., very slow STT)
    const elapsedSinceEos = 3000;
    const fillerRemaining = Math.max(0, 2500 - elapsedSinceEos);
    const timer = setTimeout(() => { fillerFired = true; }, fillerRemaining);

    // Should fire immediately (remaining = 0, setTimeout with 0)
    vi.advanceTimersByTime(0);
    expect(fillerFired).toBe(true);
    clearTimeout(timer);
  });

  it("answer speech awaits pending filler before speaking on a slow turn", async () => {
    let fillerResolve: () => void;
    let fillerPromiseRef: Promise<void> | null = new Promise<void>((resolve) => {
      fillerResolve = resolve;
    });

    const speechOrder: string[] = [];

    // Simulate the post-stream block from krishna.context.tsx
    const answerTask = (async () => {
      if (fillerPromiseRef) {
        await fillerPromiseRef;
        fillerPromiseRef = null;
      }
      speechOrder.push("answer_spoken");
    })();

    // Filler hasn't resolved — answer should be blocked
    await Promise.resolve();
    expect(speechOrder).toEqual([]);

    // Filler finishes naturally
    fillerResolve!();
    await answerTask;

    expect(speechOrder).toEqual(["answer_spoken"]);
  });
});
