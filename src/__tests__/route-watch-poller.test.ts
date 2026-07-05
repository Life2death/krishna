import { describe, it, expect, vi, beforeEach } from "vitest";
import { setHttpFetch } from "@krishna/core/http";
import { setDriver } from "@krishna/core/database/driver";

const mockGetSecret = vi.hoisted(() => vi.fn());

vi.mock("@krishna/core/secrets", () => ({
  getSecret: mockGetSecret,
  setSecretGetter: vi.fn(),
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

  it("marks expired watch and returns empty", async () => {
    mockSelect.mockResolvedValue(mockDbActiveWatch({ expires_at: Date.now() - 1000 }));

    const result = await checkRouteWatches();

    expect(result).toEqual([]);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE route_watches SET"),
      expect.arrayContaining(["expired", "watch-1"]),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("updates watch with no alert when duration under threshold", async () => {
    mockSelect.mockResolvedValue(mockDbActiveWatch());
    mockRoutesResponse([{ duration: "1200s", staticDuration: "1200s", distanceMeters: 20000 }]);

    const result = await checkRouteWatches();

    expect(result).toEqual([]);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE route_watches SET"),
      expect.arrayContaining([20, 0, "watch-1"]),
    );
  });

  it("triggers alert when duration meets threshold", async () => {
    mockSelect.mockResolvedValue(mockDbActiveWatch({ threshold_minutes: 20 }));
    mockRoutesResponse([{ duration: "1200s", staticDuration: "1200s", distanceMeters: 20000 }]);

    const result = await checkRouteWatches();

    expect(result).toHaveLength(1);
    expect(result[0].durationMinutes).toBe(20);
    expect(result[0].thresholdMinutes).toBe(20);
    expect(result[0].message).toContain("20 minutes");
    expect(result[0].message).toContain("20-minute threshold");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE route_watches SET"),
      expect.arrayContaining(["triggered", "watch-1"]),
    );
  });

  it("triggers alert when duration exceeds threshold", async () => {
    mockSelect.mockResolvedValue(mockDbActiveWatch({ threshold_minutes: 15 }));
    mockRoutesResponse([{ duration: "1500s", staticDuration: "1500s", distanceMeters: 20000 }]);

    const result = await checkRouteWatches();

    expect(result).toHaveLength(1);
    expect(result[0].durationMinutes).toBe(25);
    expect(result[0].message).toContain("25 minutes");
  });

  it("uses 'bike' label for two_wheeler mode alert", async () => {
    mockSelect.mockResolvedValue(mockDbActiveWatch({ mode: "two_wheeler", threshold_minutes: 20 }));
    mockRoutesResponse([{ duration: "1500s", staticDuration: "1500s", distanceMeters: 20000 }]);

    const result = await checkRouteWatches();

    expect(result[0].message).toContain("bike route");
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
});
