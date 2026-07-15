import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCheckPermissions = vi.hoisted(() => vi.fn());
const mockRequestPermissions = vi.hoisted(() => vi.fn());
const mockGetCurrentPosition = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/plugin-geolocation", () => ({
  checkPermissions: mockCheckPermissions,
  requestPermissions: mockRequestPermissions,
  getCurrentPosition: mockGetCurrentPosition,
}));

import { getCurrentPositionSafe } from "@/lib/geolocation";

describe("getCurrentPositionSafe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests permission when not granted, then returns coords", async () => {
    mockCheckPermissions.mockResolvedValue({ location: "prompt", coarseLocation: "prompt" });
    mockRequestPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    mockGetCurrentPosition.mockResolvedValue({
      coords: { latitude: 19.076, longitude: 72.877, accuracy: 10, altitude: null, altitudeAccuracy: null, speed: null, heading: null },
      timestamp: Date.now(),
    });

    const result = await getCurrentPositionSafe();

    expect(result).toEqual({ lat: 19.076, lng: 72.877 });
    expect(mockCheckPermissions).toHaveBeenCalledOnce();
    expect(mockRequestPermissions).toHaveBeenCalledWith(["location"]);
    expect(mockGetCurrentPosition).toHaveBeenCalledWith({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
  });

  it("returns null when permission is denied", async () => {
    mockCheckPermissions.mockResolvedValue({ location: "prompt", coarseLocation: "prompt" });
    mockRequestPermissions.mockResolvedValue({ location: "denied", coarseLocation: "denied" });

    const result = await getCurrentPositionSafe();

    expect(result).toBeNull();
    expect(mockGetCurrentPosition).not.toHaveBeenCalled();
  });

  it("returns null when getCurrentPosition throws", async () => {
    mockCheckPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    mockGetCurrentPosition.mockRejectedValue(new Error("GPS hardware error"));

    const result = await getCurrentPositionSafe();

    expect(result).toBeNull();
  });

  it("returns null on timeout", async () => {
    vi.useRealTimers();
    mockCheckPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    mockGetCurrentPosition.mockImplementation(() => new Promise(() => {}));

    const result = await getCurrentPositionSafe();

    expect(result).toBeNull();
  }, 15000);
});
