import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("L4: STT watchdog + single retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries once when first attempt aborts (timeout)", async () => {
    const mockFetchSTT = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockFetchSTT.mockRejectedValueOnce(new DOMException("The user aborted a request.", "AbortError"));
    mockFetchSTT.mockResolvedValueOnce("hello");

    const { fetchSTTWithRetry } = await import("@/lib/fetch-stt-with-retry");

    const result = await fetchSTTWithRetry(mockFetchSTT, {
      provider: undefined,
      selectedProvider: { provider: "groq", variables: {} },
      audio: new Blob(),
    });

    expect(result).toBe("hello");
    expect(mockFetchSTT).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[stt] retry"));

    warn.mockRestore();
  });

  it("retries once on generic network error", async () => {
    const mockFetchSTT = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockFetchSTT.mockRejectedValueOnce(new Error("Network error: fetch failed"));
    mockFetchSTT.mockResolvedValueOnce("hello");

    const { fetchSTTWithRetry } = await import("@/lib/fetch-stt-with-retry");

    const result = await fetchSTTWithRetry(mockFetchSTT, {
      provider: undefined,
      selectedProvider: { provider: "groq", variables: {} },
      audio: new Blob(),
    });

    expect(result).toBe("hello");
    expect(mockFetchSTT).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[stt] retry"));

    warn.mockRestore();
  });

  it("propagates error when both attempts fail", async () => {
    const mockFetchSTT = vi.fn();

    mockFetchSTT.mockRejectedValue(new Error("Network error: timeout"));

    const { fetchSTTWithRetry } = await import("@/lib/fetch-stt-with-retry");

    await expect(
      fetchSTTWithRetry(mockFetchSTT, {
        provider: undefined,
        selectedProvider: { provider: "groq", variables: {} },
        audio: new Blob(),
      }),
    ).rejects.toThrow("Network error: timeout");
    expect(mockFetchSTT).toHaveBeenCalledTimes(2);
  });

  it("returns result on first attempt without retry", async () => {
    const mockFetchSTT = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockFetchSTT.mockResolvedValue("transcription");

    const { fetchSTTWithRetry } = await import("@/lib/fetch-stt-with-retry");

    const result = await fetchSTTWithRetry(mockFetchSTT, {
      provider: undefined,
      selectedProvider: { provider: "groq", variables: {} },
      audio: new Blob(),
    });

    expect(result).toBe("transcription");
    expect(mockFetchSTT).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });
});
