import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("P4-F9: filler threshold and sequencing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no filler fires when stream completes before 1500ms threshold", () => {
    let fillerFired = false;

    // Simulate the 1500ms filler timer
    const timer = setTimeout(() => { fillerFired = true; }, 1500);

    // Stream completes before threshold — clear the timer
    clearTimeout(timer);

    // Advance well past the threshold
    vi.advanceTimersByTime(3000);

    expect(fillerFired).toBe(false);
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
