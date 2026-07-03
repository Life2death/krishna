import { describe, it, expect, vi, beforeEach } from "vitest";
import { TurnTiming } from "@/lib/turn-timing";

beforeEach(() => {
  vi.useFakeTimers();
});

describe("TurnTiming", () => {
  it("records marks in order", () => {
    vi.setSystemTime(0);
    const t = new TurnTiming();

    t.mark("end_of_speech");
    vi.advanceTimersByTime(100);
    t.mark("request_sent");
    vi.advanceTimersByTime(500);
    t.mark("first_token");
    vi.advanceTimersByTime(200);
    t.mark("last_token");
    vi.advanceTimersByTime(300);
    t.mark("first_audio");
    vi.advanceTimersByTime(1500);
    t.mark("last_audio");

    const data = t.toData();
    expect(data.marks.end_of_speech).toBeGreaterThanOrEqual(0);
    expect(data.marks.request_sent).toBeGreaterThan(data.marks.end_of_speech!);
    expect(data.marks.first_token).toBeGreaterThan(data.marks.request_sent!);
    expect(data.marks.last_token).toBeGreaterThan(data.marks.first_token!);
    expect(data.marks.first_audio).toBeGreaterThan(data.marks.last_token!);
    expect(data.marks.last_audio).toBeGreaterThan(data.marks.first_audio!);
  });

  it("computes correct deltas", () => {
    vi.setSystemTime(0);
    const t = new TurnTiming();

    t.mark("end_of_speech");
    vi.advanceTimersByTime(50);
    t.mark("request_sent");
    vi.advanceTimersByTime(600);
    t.mark("first_token");
    vi.advanceTimersByTime(200);
    t.mark("last_token");
    vi.advanceTimersByTime(400);
    t.mark("first_audio");
    vi.advanceTimersByTime(1500);
    t.mark("last_audio");

    const data = t.toData();
    expect(data.deltas.stt_to_send).toBeCloseTo(50, -1);
    expect(data.deltas.send_to_first_token).toBeCloseTo(600, -1);
    expect(data.deltas.first_token_to_last_token).toBeCloseTo(200, -1);
    expect(data.deltas.first_token_to_first_audio).toBeCloseTo(600, -1); // 200 + 400
    expect(data.deltas.first_audio_to_last_audio).toBeCloseTo(1500, -1);
    expect(data.deltas.total).toBeCloseTo(2750, -1);
  });

  it("ignores duplicate marks (first wins)", () => {
    vi.setSystemTime(0);
    const t = new TurnTiming();

    t.mark("first_token");
    const first = t.marks.first_token;
    vi.advanceTimersByTime(999);
    t.mark("first_token");

    expect(t.marks.first_token).toBe(first);
  });

  it("serializes to JSON and back", () => {
    vi.setSystemTime(0);
    const t = new TurnTiming();

    t.mark("end_of_speech");
    vi.advanceTimersByTime(100);
    t.mark("request_sent");
    vi.advanceTimersByTime(500);
    t.mark("first_token");
    vi.advanceTimersByTime(200);
    t.mark("first_audio");

    const json = t.toJSON();
    const restored = TurnTiming.fromJSON(json);

    expect(restored).not.toBeNull();
    expect(restored!.marks.end_of_speech).toBe(t.marks.end_of_speech);
    expect(restored!.marks.request_sent).toBe(t.marks.request_sent);
    expect(restored!.marks.first_token).toBe(t.marks.first_token);
    expect(restored!.marks.first_audio).toBe(t.marks.first_audio);
    expect(restored!.deltas.stt_to_send).toBeCloseTo(100, -1);
    expect(restored!.deltas.send_to_first_token).toBeCloseTo(500, -1);
  });

  it("returns null for invalid JSON", () => {
    const result = TurnTiming.fromJSON("not-json");
    expect(result).toBeNull();
  });

  it("freezes and ignores subsequent marks", () => {
    vi.setSystemTime(0);
    const t = new TurnTiming();

    t.mark("end_of_speech");
    t.freeze();
    vi.advanceTimersByTime(999);
    t.mark("first_token");

    expect(t.marks.first_token).toBeUndefined();
  });

  it("handles partial marks (incomplete turn)", () => {
    vi.setSystemTime(0);
    const t = new TurnTiming();

    t.mark("end_of_speech");
    vi.advanceTimersByTime(100);
    t.mark("request_sent");

    const data = t.toData();
    expect(data.deltas.stt_to_send).toBeCloseTo(100, -1);
    expect(data.deltas.send_to_first_token).toBeUndefined();
    expect(data.deltas.total).toBeUndefined();
  });
});
