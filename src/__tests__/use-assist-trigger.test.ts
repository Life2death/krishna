// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAssistTrigger } from "@/hooks/useAssistTrigger";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

let focusCallback: ((e: { payload: boolean }) => void) | null = null;
const mockOnFocusChanged = vi.fn((cb: (e: { payload: boolean }) => void) => {
  focusCallback = cb;
  return Promise.resolve(() => {
    focusCallback = null;
  });
});
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: mockOnFocusChanged,
  }),
}));

function androidUserAgent() {
  Object.defineProperty(navigator, "userAgent", {
    value: "Mozilla/5.0 (Linux; Android 16)",
    configurable: true,
  });
}

function desktopUserAgent() {
  Object.defineProperty(navigator, "userAgent", {
    value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    configurable: true,
  });
}

describe("useAssistTrigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    focusCallback = null;
    androidUserAgent();
  });

  it("starts Classic listening exactly once when an assist is pending on mount", async () => {
    mockInvoke.mockResolvedValueOnce(true);
    const startClassicListening = vi.fn();
    const startLive = vi.fn();

    renderHook(() =>
      useAssistTrigger({
        isLiveMode: false,
        isLiveActive: false,
        startClassicListening,
        startLive,
      }),
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("android_take_pending_assist");
    });
    await waitFor(() => {
      expect(startClassicListening).toHaveBeenCalledTimes(1);
    });
    expect(startLive).not.toHaveBeenCalled();
  });

  it("starts the Live session exactly once when an assist is pending and Live isn't already active", async () => {
    mockInvoke.mockResolvedValueOnce(true);
    const startClassicListening = vi.fn();
    const startLive = vi.fn();

    renderHook(() =>
      useAssistTrigger({
        isLiveMode: true,
        isLiveActive: false,
        startClassicListening,
        startLive,
      }),
    );

    await waitFor(() => {
      expect(startLive).toHaveBeenCalledTimes(1);
    });
    expect(startClassicListening).not.toHaveBeenCalled();
  });

  it("does not restart an already-active Live session", async () => {
    mockInvoke.mockResolvedValueOnce(true);
    const startClassicListening = vi.fn();
    const startLive = vi.fn();

    renderHook(() =>
      useAssistTrigger({
        isLiveMode: true,
        isLiveActive: true,
        startClassicListening,
        startLive,
      }),
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("android_take_pending_assist");
    });
    expect(startLive).not.toHaveBeenCalled();
    expect(startClassicListening).not.toHaveBeenCalled();
  });

  it("no-ops when nothing is pending", async () => {
    mockInvoke.mockResolvedValue(false);
    const startClassicListening = vi.fn();
    const startLive = vi.fn();

    renderHook(() =>
      useAssistTrigger({
        isLiveMode: false,
        isLiveActive: false,
        startClassicListening,
        startLive,
      }),
    );

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("android_take_pending_assist");
    });
    expect(startClassicListening).not.toHaveBeenCalled();
    expect(startLive).not.toHaveBeenCalled();
  });

  it("never invokes on non-mobile (desktop)", async () => {
    desktopUserAgent();
    const startClassicListening = vi.fn();
    const startLive = vi.fn();

    renderHook(() =>
      useAssistTrigger({
        isLiveMode: false,
        isLiveActive: false,
        startClassicListening,
        startLive,
      }),
    );

    // Give any stray microtask a chance to run, then assert it never fired.
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockOnFocusChanged).not.toHaveBeenCalled();
  });

  it("re-checks on window focus and fires exactly once per pending flag", async () => {
    mockInvoke.mockResolvedValueOnce(false); // mount-time check: nothing pending yet
    const startClassicListening = vi.fn();
    const startLive = vi.fn();

    renderHook(() =>
      useAssistTrigger({
        isLiveMode: false,
        isLiveActive: false,
        startClassicListening,
        startLive,
      }),
    );

    await waitFor(() => expect(mockOnFocusChanged).toHaveBeenCalled());
    expect(startClassicListening).not.toHaveBeenCalled();

    // Assist gesture fires while backgrounded; app regains focus.
    mockInvoke.mockResolvedValueOnce(true);
    act(() => {
      focusCallback?.({ payload: true });
    });

    await waitFor(() => {
      expect(startClassicListening).toHaveBeenCalledTimes(1);
    });

    // A second focus event with nothing newly pending must NOT fire again.
    mockInvoke.mockResolvedValueOnce(false);
    act(() => {
      focusCallback?.({ payload: true });
    });

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledTimes(3); // mount + 2 focus events
    });
    expect(startClassicListening).toHaveBeenCalledTimes(1);
  });
});
