// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useVoiceStatus, type VoiceIdCardState } from "@/hooks/useVoiceStatus";
import type { VoiceStatus } from "@/lib/voice-client";

const mockGetVoiceStatus = vi.fn();
const mockIsVoiceIdEnabled = vi.fn();
let mockBrainConfig: { voiceIdEnabled?: boolean; voiceThreshold?: number };

vi.mock("@/lib/voice-client", () => ({
  getVoiceStatus: (...args: unknown[]) => mockGetVoiceStatus(...args),
  isVoiceIdEnabled: (...args: unknown[]) => mockIsVoiceIdEnabled(...args),
  resetEnrollment: vi.fn(),
  enrollVoice: vi.fn(),
}));

vi.mock("@/lib/brain-config", () => ({
  readBrainConfig: () => mockBrainConfig,
  saveBrainConfig: (cfg: { voiceIdEnabled?: boolean; voiceThreshold?: number }) => {
    mockBrainConfig = { ...mockBrainConfig, ...cfg };
  },
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
    mockBrainConfig = { voiceIdEnabled: false, voiceThreshold: 0.85 };
    mockIsVoiceIdEnabled.mockImplementation(() => mockBrainConfig.voiceIdEnabled ?? false);
  });

  it("returns empty state when sampleCount is 0", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ sampleCount: 0, thresholdConfidence: 0 }));
    mockBrainConfig.voiceIdEnabled = false;

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.state).toBe("empty" satisfies VoiceIdCardState);
    expect(result.current.percent).toBe(0);
    expect(result.current.canEnable).toBe(false);
    expect(result.current.enabled).toBe(false);
  });

  it("returns training state when 0 < confidence < 1", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 0.5 }));
    mockBrainConfig.voiceIdEnabled = false;

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.state).toBe("training" satisfies VoiceIdCardState);
    expect(result.current.canEnable).toBe(false);
    expect(result.current.enabled).toBe(false);
  });

  it("returns ready state when confidence >= 1 and not enabled", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 1 }));
    mockBrainConfig.voiceIdEnabled = false;

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.state).toBe("ready" satisfies VoiceIdCardState);
    expect(result.current.canEnable).toBe(true);
    expect(result.current.enabled).toBe(false);
  });

  it("returns active state when confidence >= 1 and enabled", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 1 }));
    mockBrainConfig.voiceIdEnabled = true;

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.state).toBe("active" satisfies VoiceIdCardState);
    expect(result.current.canEnable).toBe(true);
    expect(result.current.enabled).toBe(true);
  });
});

describe("useVoiceStatus — percent rounding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrainConfig = { voiceIdEnabled: false, voiceThreshold: 0.85 };
    mockIsVoiceIdEnabled.mockImplementation(() => mockBrainConfig.voiceIdEnabled ?? false);
  });

  it("rounds confidence 0.167 to 17", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 0.167 }));
    mockBrainConfig.voiceIdEnabled = false;

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.percent).toBe(17);
  });

  it("rounds confidence 0.999 to 100", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 0.999 }));
    mockBrainConfig.voiceIdEnabled = false;

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.percent).toBe(100);
  });

  it("handles null thresholdConfidence as 0", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: null }));
    mockBrainConfig.voiceIdEnabled = false;

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.percent).toBe(0);
    expect(result.current.state).toBe("training" satisfies VoiceIdCardState);
  });
});

describe("useVoiceStatus — canEnable boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrainConfig = { voiceIdEnabled: false, voiceThreshold: 0.85 };
    mockIsVoiceIdEnabled.mockImplementation(() => mockBrainConfig.voiceIdEnabled ?? false);
  });

  it("canEnable is false at 0.99 confidence", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 0.99 }));
    mockBrainConfig.voiceIdEnabled = false;

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.percent).toBe(99);
    expect(result.current.canEnable).toBe(false);
  });

  it("canEnable is true at exactly 1.0 confidence", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 1 }));
    mockBrainConfig.voiceIdEnabled = false;

    const { result } = renderHook(() => useVoiceStatus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.percent).toBe(100);
    expect(result.current.canEnable).toBe(true);
  });
});

describe("useVoiceStatus — enabled / setEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrainConfig = { voiceIdEnabled: false, voiceThreshold: 0.85 };
    mockIsVoiceIdEnabled.mockImplementation(() => mockBrainConfig.voiceIdEnabled ?? false);
  });

  it("reflects enabled=false from brain-config", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 1 }));
    mockBrainConfig.voiceIdEnabled = false;

    const { result } = renderHook(() => useVoiceStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.enabled).toBe(false);
  });

  it("reflects enabled=true from brain-config", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 1 }));
    mockBrainConfig.voiceIdEnabled = true;

    const { result } = renderHook(() => useVoiceStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.enabled).toBe(true);
  });

  it("setEnabled(true) saves to brain-config and re-renders", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 1 }));
    mockBrainConfig.voiceIdEnabled = false;

    const { result } = renderHook(() => useVoiceStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.enabled).toBe(false);

    await act(async () => {
      result.current.setEnabled(true);
    });

    expect(mockBrainConfig.voiceIdEnabled).toBe(true);
    expect(result.current.enabled).toBe(true);
  });

  it("setEnabled(false) saves even when canEnable is false", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 0.5 }));
    mockBrainConfig = { voiceIdEnabled: true, voiceThreshold: 0.85 };

    const { result } = renderHook(() => useVoiceStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.enabled).toBe(true);
    expect(result.current.canEnable).toBe(false);

    await act(async () => {
      result.current.setEnabled(false);
    });

    expect(mockBrainConfig.voiceIdEnabled).toBe(false);
    expect(result.current.enabled).toBe(false);
  });
});

describe("useVoiceStatus — setEnabled strict gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrainConfig = { voiceIdEnabled: false, voiceThreshold: 0.85 };
    mockIsVoiceIdEnabled.mockImplementation(() => mockBrainConfig.voiceIdEnabled ?? false);
  });

  it("blocks enabling when confidence < 1", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 0.75 }));
    mockBrainConfig.voiceIdEnabled = false;

    const { result } = renderHook(() => useVoiceStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canEnable).toBe(false);
    expect(result.current.enabled).toBe(false);

    await act(async () => {
      result.current.setEnabled(true);
    });

    // Must NOT have saved
    expect(mockBrainConfig.voiceIdEnabled).toBeFalsy();
    expect(result.current.enabled).toBe(false);
  });

  it("allows enabling when confidence >= 1", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 1 }));
    mockBrainConfig.voiceIdEnabled = false;

    const { result } = renderHook(() => useVoiceStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canEnable).toBe(true);

    await act(async () => {
      result.current.setEnabled(true);
    });

    expect(mockBrainConfig.voiceIdEnabled).toBe(true);
    expect(result.current.enabled).toBe(true);
  });

  it("always allows disabling regardless of confidence", async () => {
    mockGetVoiceStatus.mockResolvedValue(makeStatus({ thresholdConfidence: 0.4 }));
    mockBrainConfig = { voiceIdEnabled: true, voiceThreshold: 0.85 };

    const { result } = renderHook(() => useVoiceStatus());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.canEnable).toBe(false);
    expect(result.current.enabled).toBe(true);

    await act(async () => {
      result.current.setEnabled(false);
    });

    expect(mockBrainConfig.voiceIdEnabled).toBe(false);
    expect(result.current.enabled).toBe(false);
  });
});
