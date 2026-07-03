// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useVoiceStatus, type VoiceIdCardState } from "@/hooks/useVoiceStatus";
import type { VoiceStatus } from "@/lib/voice-client";

const mockGetVoiceStatus = vi.fn();
const mockIsVoiceIdEnabled = vi.fn();

vi.mock("@/lib/voice-client", () => ({
  getVoiceStatus: (...args: unknown[]) => mockGetVoiceStatus(...args),
  isVoiceIdEnabled: (...args: unknown[]) => mockIsVoiceIdEnabled(...args),
  resetEnrollment: vi.fn(),
  enrollVoice: vi.fn(),
}));

function makeStatus(overrides: Partial<VoiceStatus> = {}): VoiceStatus {
  return {
    enrolled: true,
    sampleCount: 12,
    dims: 512,
    threshold: 0.85,
    mature: true,
    adaptiveThreshold: 0.87,
    thresholdConfidence: 0.5,
    ...overrides,
  };
}

describe("useVoiceStatus — state derivation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty state when sampleCount is 0", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ sampleCount: 0, thresholdConfidence: 0 }));
    mockIsVoiceIdEnabled.mockReturnValue(false);

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.state).toBe("empty" satisfies VoiceIdCardState);
    expect(result.current.percent).toBe(0);
    expect(result.current.canEnable).toBe(false);
  });

  it("returns training state when 0 < confidence < 1", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 0.5 }));
    mockIsVoiceIdEnabled.mockReturnValue(false);

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.state).toBe("training" satisfies VoiceIdCardState);
    expect(result.current.canEnable).toBe(false);
  });

  it("returns ready state when confidence >= 1 and not enabled", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 1 }));
    mockIsVoiceIdEnabled.mockReturnValue(false);

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.state).toBe("ready" satisfies VoiceIdCardState);
    expect(result.current.canEnable).toBe(true);
  });

  it("returns active state when confidence >= 1 and enabled", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 1 }));
    mockIsVoiceIdEnabled.mockReturnValue(true);

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.state).toBe("active" satisfies VoiceIdCardState);
    expect(result.current.canEnable).toBe(true);
  });
});

describe("useVoiceStatus — percent rounding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rounds confidence 0.167 to 17", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 0.167 }));
    mockIsVoiceIdEnabled.mockReturnValue(false);

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.percent).toBe(17);
  });

  it("rounds confidence 0.999 to 100", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 0.999 }));
    mockIsVoiceIdEnabled.mockReturnValue(false);

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.percent).toBe(100);
  });

  it("handles null thresholdConfidence as 0", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: null }));
    mockIsVoiceIdEnabled.mockReturnValue(false);

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.percent).toBe(0);
    expect(result.current.state).toBe("training" satisfies VoiceIdCardState);
  });
});

describe("useVoiceStatus — canEnable boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("canEnable is false at 0.99 confidence", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 0.99 }));
    mockIsVoiceIdEnabled.mockReturnValue(false);

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.percent).toBe(99);
    expect(result.current.canEnable).toBe(false);
  });

  it("canEnable is true at exactly 1.0 confidence", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 1 }));
    mockIsVoiceIdEnabled.mockReturnValue(false);

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.percent).toBe(100);
    expect(result.current.canEnable).toBe(true);
  });
});
