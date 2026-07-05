import { getSecret } from "../secrets";
import { getActiveRouteWatch, updateRouteWatch } from "../database/route-watches.action";
import { callGoogleRoutes, type TravelMode } from "./get-travel-time";
import type { RouteWatchStatus } from "../types/route-watch";
import { getResponseSettings } from "../settings";

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
  const settings = getResponseSettings();
  const honorific = settings.honorific || "sir";
  const modeLabel = watch.mode === "two_wheeler" ? "bike" : watch.mode;

  // TI-3: expiry returns alert so scheduler speaks the close-out line
  if (now > watch.expires_at) {
    await updateRouteWatch(watch.id, { status: "expired" });
    return [{
      watchId: watch.id,
      origin: watch.origin,
      destination: watch.destination,
      mode: watch.mode,
      durationMinutes: 0,
      thresholdMinutes: watch.threshold_minutes,
      message: `Your ${modeLabel} route watch from ${watch.origin} to ${watch.destination} has ended, ${honorific}.`,
    }];
  }

  // TI-2: interval gate — skip unless enough time since last check
  const elapsed = now - (watch.last_checked_at ?? 0);
  if (elapsed < watch.interval_minutes * 60000) {
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

    // TI-1: flip to durationMinutes <= threshold_minutes — alert when route has cleared
    if (durationMinutes <= watch.threshold_minutes) {
      updates.status = "triggered";
      await updateRouteWatch(watch.id, updates);

      return [{
        watchId: watch.id,
        origin: watch.origin,
        destination: watch.destination,
        mode: watch.mode,
        durationMinutes,
        thresholdMinutes: watch.threshold_minutes,
        message: `Your ${modeLabel} route to ${watch.destination} just dropped to ${durationMinutes} minutes, ${honorific} — good time to leave.`,
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
