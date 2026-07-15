import { checkPermissions, requestPermissions, getCurrentPosition } from "@tauri-apps/plugin-geolocation";

const TIMEOUT_MS = 8000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("geolocation timeout")), ms),
    ),
  ]);
}

export async function getCurrentPositionSafe(): Promise<{ lat: number; lng: number } | null> {
  try {
    const perm = await checkPermissions();
    if (perm.location !== "granted") {
      const result = await requestPermissions(["location"]);
      if (result.location !== "granted") {
        return null;
      }
    }
    const pos = await withTimeout(
      getCurrentPosition({ enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 0 }),
      TIMEOUT_MS,
    );
    const { latitude: lat, longitude: lng } = pos.coords;
    if (lat == null || lng == null) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
