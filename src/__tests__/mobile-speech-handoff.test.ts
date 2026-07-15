// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useMobileSpeech } from "@/hooks/useMobileSpeech";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
  };
})();

Object.defineProperty(global, "localStorage", { value: localStorageMock, writable: true });

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@/hooks/useKrishna", () => ({
  useKrishna: () => ({ status: "idle", wakeWord: "hey krishna", processCommand: vi.fn() }),
}));

const HANDS_FREE_KEY = "krishna_mobile_hands_free";

describe("useMobileSpeech — Classic/Live hands-free handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockInvoke.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Linux; Android 14)",
      configurable: true,
    });
  });

  it("stops the native hands-free service when suppressed, even if the stored preference is on", async () => {
    localStorage.setItem(HANDS_FREE_KEY, "true");

    const { result } = renderHook(() => useMobileSpeech({ suppressed: true }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("android_hands_free_stop");
    });
    expect(mockInvoke).not.toHaveBeenCalledWith("android_hands_free_start");
    // The user's preference is untouched — suppression doesn't clobber it.
    expect(result.current.handsFree).toBe(true);
  });

  it("hands control back automatically once suppression lifts (no manual re-enable needed)", async () => {
    localStorage.setItem(HANDS_FREE_KEY, "true");

    const { result, rerender } = renderHook(
      ({ suppressed }) => useMobileSpeech({ suppressed }),
      { initialProps: { suppressed: true } },
    );

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("android_hands_free_stop"));
    mockInvoke.mockClear();

    rerender({ suppressed: false });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("android_hands_free_start");
    });
    expect(result.current.handsFree).toBe(true);
  });

  it("setHandsFree while suppressed stores the preference but does not start the native service", async () => {
    const { result, rerender } = renderHook(
      ({ suppressed }) => useMobileSpeech({ suppressed }),
      { initialProps: { suppressed: true } },
    );

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("android_hands_free_stop"));
    mockInvoke.mockClear();

    act(() => {
      result.current.setHandsFree(true);
    });

    // Preference is stored, but the effective (suppressed) value hasn't
    // changed, so there's no reason for a redundant native call either way.
    expect(localStorage.getItem(HANDS_FREE_KEY)).toBe("true");
    expect(mockInvoke).not.toHaveBeenCalledWith("android_hands_free_start");

    // Lift suppression (e.g. Live session ends) — now it actually starts,
    // proving the preference set while suppressed took effect.
    rerender({ suppressed: false });
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("android_hands_free_start");
    });
  });

  it("starts the native service normally when never suppressed", async () => {
    localStorage.setItem(HANDS_FREE_KEY, "true");

    renderHook(() => useMobileSpeech({ suppressed: false }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("android_hands_free_start");
    });
  });

  it("delays restarting after suppression lifts, giving the ending session's audio teardown a head start", async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem(HANDS_FREE_KEY, "true");

      const { rerender } = renderHook(
        ({ suppressed }) => useMobileSpeech({ suppressed }),
        { initialProps: { suppressed: true } },
      );

      // Flush the initial (immediate) "stop" effect.
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });
      mockInvoke.mockClear();

      rerender({ suppressed: false });

      // Immediately after suppression lifts, the native service must NOT have
      // been asked to start yet — starting here is exactly what raced a
      // just-ended Live session's mic teardown and threw a Java exception.
      expect(mockInvoke).not.toHaveBeenCalledWith("android_hands_free_start");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(799);
      });
      expect(mockInvoke).not.toHaveBeenCalledWith("android_hands_free_start");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(mockInvoke).toHaveBeenCalledWith("android_hands_free_start");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not delay stopping (suppression re-engaging) and cancels a stale pending restart", async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem(HANDS_FREE_KEY, "true");

      const { rerender } = renderHook(
        ({ suppressed }) => useMobileSpeech({ suppressed }),
        { initialProps: { suppressed: true } },
      );
      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });
      mockInvoke.mockClear();

      // Lift suppression, then immediately re-engage it before the 800ms
      // restart delay elapses — the pending start must not fire, and stop
      // must still be immediate.
      rerender({ suppressed: false });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      rerender({ suppressed: true });

      expect(mockInvoke).toHaveBeenCalledWith("android_hands_free_stop");
      expect(mockInvoke).not.toHaveBeenCalledWith("android_hands_free_start");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      // The stale pending start (from before re-suppression) must have been
      // cancelled, not fired late.
      expect(mockInvoke).not.toHaveBeenCalledWith("android_hands_free_start");
    } finally {
      vi.useRealTimers();
    }
  });
});
