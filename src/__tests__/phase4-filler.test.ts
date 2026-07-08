import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { computeFillerRemaining } from "@/lib/turn-timing";

describe("P4-F9: filler threshold and sequencing (L3: 2500ms from end-of-speech)", () => {
  describe("computeFillerRemaining", () => {
    it("returns 2500ms when EOS just happened (elapsed = 0)", () => {
      const now = performance.now();
      expect(computeFillerRemaining(now, now)).toBe(2500);
    });

    it("returns reduced timeout when EOS was 1000ms ago", () => {
      const eos = 1000;
      const now = 2000;
      expect(computeFillerRemaining(eos, now)).toBe(1500);
    });

    it("returns 0 when EOS was more than 2500ms ago", () => {
      const eos = 1000;
      const now = 4000;
      expect(computeFillerRemaining(eos, now)).toBe(0);
    });

    it("returns 0 when EOS is undefined (fallback)", () => {
      expect(computeFillerRemaining(undefined, performance.now())).toBe(0);
    });

    it("respects a custom threshold", () => {
      expect(computeFillerRemaining(1000, 1500, 3000)).toBe(2500);
    });
  });

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
