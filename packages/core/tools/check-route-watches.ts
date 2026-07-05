import { getSecret } from "../secrets";
import { getActiveRouteWatch, updateRouteWatch } from "../database/route-watches.action";
import { callGoogleRoutes, type TravelMode } from "./get-travel-time";
import type { RouteWatchStatus } from "../types/route-watch";

export interface RouteWatchAlert {
  watchId: string;
  origin: string;
  destination: string;
  mode: string;
  durationMinutes: number;
  thresholdMinutes: number;
  message: string;
}

export async function checkRouteWatches(): Promise<RouteWatchAlert[]> {
  let apiKey: string | null;
  try {
    apiKey = await getSecret("GOOGLE_MAPS_API_KEY");
  } catch {
    return [];
  }
  if (!apiKey) return [];

  const watch = await getActiveRouteWatch();
  if (!watch) return [];

  const now = Date.now();

  if (now > watch.expires_at) {
    await updateRouteWatch(watch.id, { status: "expired" });
    return [];
  }

  try {
    const routes = await callGoogleRoutes({
      origin: watch.origin,
      destination: watch.destination,
      mode: watch.mode as TravelMode,
      alternatives: false,
      apiKey,
    });

    const durationMinutes = Math.round(routes[0].duration / 60);
    const updates: {
      last_checked_at: number;
      last_duration_minutes: number;
      consecutive_failures: number;
      status?: RouteWatchStatus;
    } = {
      last_checked_at: now,
      last_duration_minutes: durationMinutes,
      consecutive_failures: 0,
    };

    if (durationMinutes >= watch.threshold_minutes) {
      updates.status = "triggered";
      await updateRouteWatch(watch.id, updates);

      const modeLabel = watch.mode === "two_wheeler" ? "bike" : watch.mode;
      const message = `Your ${modeLabel} route from ${watch.origin} to ${watch.destination} is taking ${durationMinutes} minutes — that's above your ${watch.threshold_minutes}-minute threshold.`;
      return [{
        watchId: watch.id,
        origin: watch.origin,
        destination: watch.destination,
        mode: watch.mode,
        durationMinutes,
        thresholdMinutes: watch.threshold_minutes,
        message,
      }];
    }

    await updateRouteWatch(watch.id, updates);
    return [];
  } catch {
    await updateRouteWatch(watch.id, {
      last_checked_at: now,
      consecutive_failures: watch.consecutive_failures + 1,
    });
    return [];
  }
}
