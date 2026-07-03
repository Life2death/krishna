import type { Tool } from "./index";
import { getSecret } from "../secrets";
import { getResponseSettings } from "../settings";
import { resolvePlace } from "./place-resolver";

// ── Types ────────────────────────────────────────────────────────────────

export type TravelMode = "car" | "two_wheeler" | "transit" | "bicycle" | "walk";

export interface RouteInfo {
  duration: number;
  staticDuration: number;
  distanceMeters: number;
  description?: string;
  transitSummary?: string;
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
// Request body:
//   origin.address / destination.address — text strings (no separate geocoding)
//   travelMode — "DRIVE" | "TWO_WHEELER" | "TRANSIT" | "BICYCLE" | "WALK"
//   routingPreference — "TRAFFIC_AWARE" for DRIVE/TWO_WHEELER; omitted for TRANSIT
//   computeAlternativeRoutes — boolean
//
// Response fields (via field mask):
//   routes.duration        — traffic-aware time ("165s")
//   routes.staticDuration  — time without traffic ("150s")
//   routes.distanceMeters  — integer
//   routes.routeLabels     — ["DEFAULT_ROUTE"] or ["DEFAULT_ROUTE_ALTERNATE"]
//   routes.description     — human-readable label ("via Eastern Expressway")
//   routes.legs.steps.travelMode — per-step travel mode (for transit detection)
//   routes.legs.steps.transitDetails.transitLine.vehicle.type — Google's enum:
//     BUS | INTERCITY_BUS | TROLLEYBUS | SUBWAY | METRO_RAIL | TRAIN | RAIL |
//     HEAVY_RAIL | HIGH_SPEED_RAIL | LIGHT_RAIL | MONORAIL | TRAM | STREETCAR |
//     FERRY | CABLE_CAR | GONDOLA_LIFT | FUNICULAR | OTHER
//     (https://developers.google.com/maps/documentation/routes/reference/rest/v2/RouteTravelMode)
//   routes.legs.steps.transitDetails.transitLine.name — e.g. "Harbour Line"

const GOOGLE_ROUTES_BASE = "https://routes.googleapis.com/directions/v2:computeRoutes";

const MODE_TO_GOOGLE: Record<TravelMode, string> = {
  car: "DRIVE",
  two_wheeler: "TWO_WHEELER",
  transit: "TRANSIT",
  bicycle: "BICYCLE",
  walk: "WALK",
};

const MODE_TO_MAPS_URL: Record<TravelMode, string> = {
  car: "driving",
  two_wheeler: "driving",
  transit: "transit",
  bicycle: "bicycling",
  walk: "walking",
};

const VEHICLE_TYPE_LABEL: Record<string, string> = {
  BUS: "bus",
  INTERCITY_BUS: "bus",
  TROLLEYBUS: "bus",
  SUBWAY: "subway",
  METRO_RAIL: "subway",
  TRAIN: "train",
  RAIL: "train",
  HEAVY_RAIL: "train",
  HIGH_SPEED_RAIL: "train",
  LIGHT_RAIL: "light rail",
  MONORAIL: "monorail",
  TRAM: "tram",
  STREETCAR: "tram",
  FERRY: "ferry",
  CABLE_CAR: "cable car",
  GONDOLA_LIFT: "cable car",
  FUNICULAR: "cable car",
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

  if (mode === "car" || mode === "two_wheeler") {
    body.routingPreference = "TRAFFIC_AWARE";
  }

  const fieldMask = [
    "routes.duration",
    "routes.staticDuration",
    "routes.distanceMeters",
    "routes.routeLabels",
    "routes.description",
    "routes.legs.steps.travelMode",
    "routes.legs.steps.transitDetails.transitLine.vehicle.type",
    "routes.legs.steps.transitDetails.transitLine.name",
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

  return rawRoutes.map((r: any) => {
    const route = r as any;
    const info: RouteInfo = {
      duration: parseDuration(route.duration),
      staticDuration: parseDuration(route.staticDuration),
      distanceMeters: route.distanceMeters ?? 0,
      description: route.description ?? undefined,
    };

    if (mode === "transit") {
      info.transitSummary = deriveTransitSummary(route);
    }

    return info;
  });
}

function parseDuration(s: string | undefined): number {
  if (!s) return 0;
  const match = s.match(/^([\d.]+)s$/);
  if (!match) return 0;
  return Math.round(parseFloat(match[1]));
}

// Count transit-vehicle types across all legs/steps; return "mostly by {vehicle}" string.
// Google's RouteTravelMode docs: https://developers.google.com/maps/documentation/routes/reference/rest/v2/RouteTravelMode
function deriveTransitSummary(route: any): string | undefined {
  const vehicleCounts: Record<string, number> = {};
  const lineNames: Set<string> = new Set();
  let totalTransitSteps = 0;

  const legs = route.legs;
  if (!legs || !Array.isArray(legs)) return undefined;

  for (const leg of legs) {
    const steps = leg.steps;
    if (!steps || !Array.isArray(steps)) continue;
    for (const step of steps) {
      if ((step.travelMode as string) !== "TRANSIT") continue;
      totalTransitSteps++;
      const td = step.transitDetails;
      if (!td) continue;
      const line = td.transitLine;
      if (!line) continue;
      if (line.name) lineNames.add(line.name);
      const vt = line.vehicle?.type as string | undefined;
      if (vt) {
        const label = VEHICLE_TYPE_LABEL[vt] || "transit";
        vehicleCounts[label] = (vehicleCounts[label] || 0) + 1;
      }
    }
  }

  if (totalTransitSteps === 0) return undefined;

  // Find the most common vehicle label
  let topLabel = "transit";
  let topCount = 0;
  for (const [label, count] of Object.entries(vehicleCounts)) {
    if (count > topCount) {
      topCount = count;
      topLabel = label;
    }
  }

  let summary = `mostly by ${topLabel}`;
  if (lineNames.size > 0) {
    summary += ` — ${[...lineNames][0]}`;
  }

  return summary;
}

// ── Spoken formatting ────────────────────────────────────────────────────
// Rules (from plan):
// - Round to minutes ("about 40 minutes")
// - Traffic delta when duration - staticDuration >= 5 min ("about 10 slower than usual")
// - At most ONE alternative (the fastest non-default), by road name
// - Transit: total time + primary leg ("mostly by train")

const MODE_LABEL: Record<TravelMode, string> = {
  car: "car",
  two_wheeler: "bike",
  transit: "transit",
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
    text = `By transit it's about ${primaryMin} minutes`;
    if (primary.transitSummary) {
      text += `, ${primary.transitSummary}`;
    }
    const alternatives = routes
      .slice(1)
      .filter((r) => r.transitSummary)
      .sort((a, b) => a.duration - b.duration);
    if (alternatives.length > 0) {
      const best = alternatives[0];
      const altMin = Math.round(best.duration / 60);
      text += `. ${best.transitSummary} — that one takes about ${altMin}`;
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
    'Args: from (origin, default "home"), to (destination), mode (car|two_wheeler|transit|bicycle|walk, default car).',
  run: async (args, ctx) => {
    const rawOrigin = args.from || args.origin || "home";
    const rawDestination = args.to || args.destination;
    const mode: TravelMode = (args.mode as TravelMode) || "car";

    if (!rawDestination) {
      return { success: false, error: "Missing required args: from and to" };
    }

    const origin = await resolvePlace(rawOrigin);
    const destination = await resolvePlace(rawDestination);

    if (!["car", "two_wheeler", "transit", "bicycle", "walk"].includes(mode)) {
      return { success: false, error: `Invalid mode: ${mode}. Use car, two_wheeler, transit, bicycle, or walk.` };
    }

    const settings = getResponseSettings();
    const honorific = settings.honorific || "sir";
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

        const output = formatTravelOutput(routes, mode, honorific);

        return {
          success: true,
          output,
          data: {
            duration: String(routes[0].duration),
            staticDuration: String(routes[0].staticDuration),
            distanceMeters: String(routes[0].distanceMeters),
            description: routes[0].description ?? "",
            transitSummary: routes[0].transitSummary ?? "",
            routeCount: String(routes.length),
            fallback: "false",
          } as Record<string, string>,
        };
      } catch {
        const mapsUrl = buildMapsUrl(origin, destination, mode);
        return {
          success: true,
          output: `I've opened the route on Maps — the live traffic lookup didn't go through this time, ${honorific}.`,
          data: {
            url: mapsUrl,
            fallback: "true",
          } as Record<string, string>,
        };
      }
    }

    const mapsUrl = buildMapsUrl(origin, destination, mode);
    return {
      success: true,
      output:
        `I've opened the route on Maps. Add a Maps API key in Settings and I can read out times with live traffic, ${honorific}.`,
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
