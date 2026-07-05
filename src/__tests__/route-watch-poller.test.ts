import { describe, it, expect, vi, beforeEach } from "vitest";
import { setHttpFetch } from "@krishna/core/http";
import { setDriver } from "@krishna/core/database/driver";

const mockGetSecret = vi.hoisted(() => vi.fn());
const mockGetResponseSettings = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    honorific: "sir",
    responseLength: "auto",
    language: "english",
    autoScroll: true,
    voiceMaxTokens: 100,
    voiceModel: "",
  }),
);

vi.mock("@krishna/core/secrets", () => ({
  getSecret: mockGetSecret,
  setSecretGetter: vi.fn(),
}));

vi.mock("@krishna/core/settings", () => ({
  getResponseSettings: mockGetResponseSettings,
  setSettingsGetter: vi.fn(),
  RESPONSE_LENGTHS: {},
  LANGUAGES: [],
}));

import { checkRouteWatches } from "@krishna/core/tools/check-route-watches";

const mockSelect = vi.fn();
const mockExecute = vi.fn().mockResolvedValue({ rowsAffected: 1 });
const mockFetch = vi.fn();

function mockRoutesResponse(routes: any[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ routes }),
  });
}

function mockDbActiveWatch(overrides?: Record<string, unknown>) {
  const now = Date.now();
  return [{
    id: "watch-1",
    origin: "123 Main St",
    destination: "456 Oak Ave",
    mode: "car",
    threshold_minutes: 30,
    interval_minutes: 15,
    expires_at: now + 7200000,
    last_checked_at: null,
    last_duration_minutes: null,
    consecutive_failures: 0,
    status: "active",
    created_at: now,
    ...overrides,
  }];
}

describe("checkRouteWatches", () => {
  beforeEach(() => {
    mockGetSecret.mockReset().mockResolvedValue("test-key");
    mockGetResponseSettings.mockReturnValue({ honorific: "sir" });
    mockSelect.mockReset();
    mockExecute.mockReset().mockResolvedValue({ rowsAffected: 1 });
    mockFetch.mockReset();
    setDriver({ select: mockSelect, execute: mockExecute } as any);
    setHttpFetch(mockFetch);
    vi.stubGlobal("fetch", mockFetch);
  });

  it("returns empty when no active watch", async () => {
    mockSelect.mockResolvedValue([]);

    const result = await checkRouteWatches();

    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns empty when no API key", async () => {
    mockGetSecret.mockResolvedValue(null);

    const result = await checkRouteWatches();

    expect(result).toEqual([]);
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns empty when getSecret throws", async () => {
    mockGetSecret.mockRejectedValue(new Error("no keychain"));

    const result = await checkRouteWatches();

    expect(result).toEqual([]);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns alert when watch expired — TI-3", async () => {
    mockSelect.mockResolvedValue(mockDbActiveWatch({ expires_at: Date.now() - 1000 }));

    const result = await checkRouteWatches();

    expect(result).toHaveLength(1);
    expect(result[0].message).toContain("has ended");
    expect(result[0].message).toContain("sir");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE route_watches SET"),
      expect.arrayContaining(["expired", "watch-1"]),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips API call when interval not yet elapsed — TI-2", async () => {
    const now = Date.now();
    mockSelect.mockResolvedValue(mockDbActiveWatch({ last_checked_at: now - 300000 })); // 5 min ago, < 15 min interval

    const result = await checkRouteWatches();

    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls API when interval has elapsed — TI-2", async () => {
    const now = Date.now();
    mockSelect.mockResolvedValue(mockDbActiveWatch({ last_checked_at: now - 1200000 })); // 20 min ago, > 15 min interval
    mockRoutesResponse([{ duration: "1200s", staticDuration: "1200s", distanceMeters: 20000 }]);

    const result = await checkRouteWatches();

    // duration 20 <= threshold 30 → alert
    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("no alert when duration still above threshold — TI-1", async () => {
    mockSelect.mockResolvedValue(mockDbActiveWatch({ threshold_minutes: 15 }));
    mockRoutesResponse([{ duration: "1200s", staticDuration: "1200s", distanceMeters: 20000 }]); // 20 min

    const result = await checkRouteWatches();

    // 20 <= 15 is false → no alert
    expect(result).toEqual([]);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute.mock.calls[0][1]).not.toContain("triggered");
  });

  it("triggers alert when duration drops to threshold — TI-1", async () => {
    mockSelect.mockResolvedValue(mockDbActiveWatch({ threshold_minutes: 20 }));
    mockRoutesResponse([{ duration: "1200s", staticDuration: "1200s", distanceMeters: 20000 }]); // 20 min

    const result = await checkRouteWatches();

    // 20 <= 20 is true → alert
    expect(result).toHaveLength(1);
    expect(result[0].durationMinutes).toBe(20);
    expect(result[0].thresholdMinutes).toBe(20);
    expect(result[0].message).toContain("just dropped to 20 minutes");
    expect(result[0].message).toContain("good time to leave");
    expect(result[0].message).toContain("sir");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE route_watches SET"),
      expect.arrayContaining(["triggered", "watch-1"]),
    );
  });

  it("uses 'bike' label for two_wheeler mode alert — TI-1", async () => {
    mockSelect.mockResolvedValue(mockDbActiveWatch({ mode: "two_wheeler", threshold_minutes: 20 }));
    mockRoutesResponse([{ duration: "900s", staticDuration: "900s", distanceMeters: 20000 }]); // 15 min

    const result = await checkRouteWatches();

    // 15 <= 20 is true → alert
    expect(result[0].message).toContain("bike route");
    expect(result[0].message).toContain("good time to leave");
  });

  it("increments consecutive_failures on API error", async () => {
    mockSelect.mockResolvedValue(mockDbActiveWatch());
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal error",
    });

    const result = await checkRouteWatches();

    expect(result).toEqual([]);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE route_watches SET"),
      expect.arrayContaining([1, "watch-1"]),
    );
  });

  it("uses configured honorific from settings", async () => {
    mockGetResponseSettings.mockReturnValue({ honorific: "madam" });
    mockSelect.mockResolvedValue(mockDbActiveWatch({ threshold_minutes: 20 }));
    mockRoutesResponse([{ duration: "900s", staticDuration: "900s", distanceMeters: 20000 }]); // 15 min

    const result = await checkRouteWatches();

    expect(result[0].message).toContain("madam");
    expect(result[0].message).not.toContain("sir");
  });
});
