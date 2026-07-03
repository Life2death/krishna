import type { Tool } from "./index";
import { getSecret } from "../secrets";

// ── Types ────────────────────────────────────────────────────────────────

export type TravelMode = "car" | "two_wheeler" | "transit" | "bicycle" | "walk";

export interface RouteInfo {
  duration: number;
  staticDuration: number;
  distanceMeters: number;
  description?: string;
}

// ── Google Routes v2: computeRoutes ──────────────────────────────────────
// Docs: https://developers.google.com/maps/documentation/routes/compute_route_directions
// Reference: https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRoutes
//
// Endpoint:  POST https://routes.googleapis.com/directions/v2:computeRoutes
// Headers:
//   X-Goog-Api-Key     (required)
//   X-Goog-FieldMask   (required — masks what fields to return)
//   Content-Type: application/json
//
// Request body fields used:
//   origin.address / destination.address — text strings accepted (no separate geocoding)
//   travelMode — "DRIVE" | "TWO_WHEELER" | "TRANSIT" | "BICYCLE" | "WALK"
//   routingPreference — "TRAFFIC_AWARE" for DRIVE/TWO_WHEELER; omitted for TRANSIT
//   computeAlternativeRoutes — boolean
//
// Response fields (via field mask):
//   routes.duration        — traffic-aware time (string like "165s")
//   routes.staticDuration  — time without traffic (string like "150s")
//   routes.distanceMeters  — integer
//   routes.routeLabels     — ["DEFAULT_ROUTE"] or ["DEFAULT_ROUTE_ALTERNATE"]
//   routes.description     — human-readable label, e.g. "via Eastern Expressway"

const GOOGLE_ROUTES_BASE = "https://routes.googleapis.com/directions/v2:computeRoutes";

const MODE_TO_GOOGLE: Record<TravelMode, string> = {
  car: "DRIVE",
  two_wheeler: "TWO_WHEELER",
  transit: "TRANSIT",
  bicycle: "BICYCLE",
  walk: "WALK",
};

// Maps URL fallback travelmode values (Google Maps URLs API)
const MODE_TO_MAPS_URL: Record<TravelMode, string> = {
  car: "driving",
  two_wheeler: "driving",
  transit: "transit",
  bicycle: "bicycling",
  walk: "walking",
};

export async function callGoogleRoutes(params: {
  origin: string;
  destination: string;
  mode: TravelMode;
  alternatives: boolean;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<RouteInfo[]> {
  const { origin, destination, mode, alternatives, apiKey, signal } = params;
  const travelMode = MODE_TO_GOOGLE[mode];

  const body: Record<string, unknown> = {
    origin: { address: origin },
    destination: { address: destination },
    travelMode,
    computeAlternativeRoutes: alternatives,
  };

  // routingPreference is only valid for DRIVE and TWO_WHEELER
  if (mode === "car" || mode === "two_wheeler") {
    body.routingPreference = "TRAFFIC_AWARE";
  }

  const fieldMask = [
    "routes.duration",
    "routes.staticDuration",
    "routes.distanceMeters",
    "routes.routeLabels",
    "routes.description",
  ].join(",");

  const response = await fetch(GOOGLE_ROUTES_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Google Routes API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const rawRoutes: unknown[] = data?.routes ?? [];

  if (rawRoutes.length === 0) {
    throw new Error("No routes found");
  }

  return rawRoutes.map((r: any) => ({
    duration: parseDuration((r as any).duration),
    staticDuration: parseDuration((r as any).staticDuration),
    distanceMeters: (r as any).distanceMeters ?? 0,
    description: (r as any).description ?? undefined,
  }));
}

// Parse a proto-Duration string like "165s" or "3.5s" to integer seconds
function parseDuration(s: string | undefined): number {
  if (!s) return 0;
  const match = s.match(/^([\d.]+)s$/);
  if (!match) return 0;
  return Math.round(parseFloat(match[1]));
}

// ── Spoken formatting ────────────────────────────────────────────────────
// Rules (from plan):
// - Round to minutes ("about 40 minutes")
// - Traffic delta when duration - staticDuration >= 5 min
//   ("about 10 slower than usual")
// - At most ONE alternative (the fastest non-default), by road name
// - Transit: total time + primary leg ("mostly by train")

const MODE_LABEL: Record<TravelMode, string> = {
  car: "car",
  two_wheeler: "bike",
  transit: "transit",
  bicycle: "bicycle",
  walk: "walk",
};

const MODE_TRANSIT_LABEL: Record<TravelMode, string> = {
  car: "car",
  two_wheeler: "bike",
  transit: "train",
  bicycle: "bicycle",
  walk: "walk",
};

export function formatTravelOutput(
  routes: RouteInfo[],
  mode: TravelMode,
  honorific = "sir",
): string {
  if (routes.length === 0) return "";

  const primary = routes[0];
  const primaryMin = Math.round(primary.duration / 60);
  const trafficDeltaSec = primary.duration - primary.staticDuration;

  let text: string;

  if (mode === "transit") {
    text = `By ${MODE_LABEL[mode]} it's about ${primaryMin} minutes`;
    if (primary.description) {
      text += `, ${primary.description}`;
    }
  } else {
    const label = MODE_LABEL[mode];
    text = `By ${label} it's about ${primaryMin} minutes`;

    if (trafficDeltaSec >= 300) {
      const deltaMin = Math.round(trafficDeltaSec / 60);
      text += ` with current traffic — about ${deltaMin} slower than usual`;
    }

    const alternatives = routes
      .slice(1)
      .filter((r) => r.description)
      .sort((a, b) => a.duration - b.duration);

    if (alternatives.length > 0) {
      const best = alternatives[0];
      const altMin = Math.round(best.duration / 60);
      text += `. ${best.description} is faster today at ${altMin}`;
    }
  }

  text += `, ${honorific}.`;
  return text;
}

// ── Fallback URL ─────────────────────────────────────────────────────────
// Build a google.com/maps/dir URL for the no-key / error fallback.
// https://www.google.com/maps/dir/?api=1&origin=...&destination=...&travelmode=...

export function buildMapsUrl(
  origin: string,
  destination: string,
  mode: TravelMode,
): string {
  const travelmode = MODE_TO_MAPS_URL[mode];
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("travelmode", travelmode);
  return url.toString();
}

// ── Tool ─────────────────────────────────────────────────────────────────

export const getTravelTimeTool: Tool = {
  name: "get_travel_time",
  description:
    "Get travel time and route info between two places by car, bike, transit, or walk. " +
    "Requires a Google Maps API key in Settings. Falls back to opening Maps URL if no key. " +
    'Args: from (origin), to (destination), mode (car|two_wheeler|transit|bicycle|walk, default car).',
  run: async (args, ctx) => {
    const origin = args.from || args.origin;
    const destination = args.to || args.destination;
    const mode: TravelMode = (args.mode as TravelMode) || "car";

    if (!origin || !destination) {
      return { success: false, error: "Missing required args: from and to" };
    }

    if (!["car", "two_wheeler", "transit", "bicycle", "walk"].includes(mode)) {
      return { success: false, error: `Invalid mode: ${mode}. Use car, two_wheeler, transit, bicycle, or walk.` };
    }

    const apiKey = await getGoogleMapsKey();

    if (apiKey) {
      try {
        const routes = await callGoogleRoutes({
          origin,
          destination,
          mode,
          alternatives: true,
          apiKey,
          signal: ctx.signal,
        });

        const output = formatTravelOutput(routes, mode);

        return {
          success: true,
          output,
          data: {
            duration: String(routes[0].duration),
            staticDuration: String(routes[0].staticDuration),
            distanceMeters: String(routes[0].distanceMeters),
            description: routes[0].description ?? "",
            routeCount: String(routes.length),
            fallback: "false",
          } as Record<string, string>,
        };
      } catch {
        // Google error → fall through to URL fallback
      }
    }

    const mapsUrl = buildMapsUrl(origin, destination, mode);
    return {
      success: true,
      output:
        "I've opened the route on Maps. Add a Maps API key in Settings and I can read out times with live traffic.",
      data: {
        url: mapsUrl,
        fallback: "true",
      } as Record<string, string>,
    };
  },
};

async function getGoogleMapsKey(): Promise<string | null> {
  try {
    return await getSecret("GOOGLE_MAPS_API_KEY");
  } catch {
    return null;
  }
}
