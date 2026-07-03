import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSecret = vi.hoisted(() => vi.fn().mockResolvedValue("test-key"));
const mockGetResponseSettings = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    responseLength: "auto",
    language: "english",
    autoScroll: true,
    honorific: "sir",
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

import {
  getTravelTimeTool,
  formatTravelOutput,
  buildMapsUrl,
  callGoogleRoutes,
  type RouteInfo,
  type TravelMode,
} from "@krishna/core/tools/get-travel-time";

// ── Helpers ──────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

function mockRoutesResponse(routes: any[]) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ routes }),
  });
}

function mockFetchError(status: number, body = "") {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => body,
  });
}

// ── formatTravelOutput ───────────────────────────────────────────────────

describe("formatTravelOutput", () => {
  it("rounds duration to minutes (car)", () => {
    const routes: RouteInfo[] = [
      { duration: 2450, staticDuration: 2400, distanceMeters: 40000 },
    ];
    expect(formatTravelOutput(routes, "car")).toBe(
      "By car it's about 41 minutes, sir.",
    );
  });

  it("includes traffic delta when ≥ 5 min", () => {
    const routes: RouteInfo[] = [
      { duration: 3600, staticDuration: 3000, distanceMeters: 50000 },
    ];
    const result = formatTravelOutput(routes, "car");
    expect(result).toContain("about 10 slower than usual");
    expect(result).toContain("60 minutes");
  });

  it("omits traffic delta when < 5 min", () => {
    const routes: RouteInfo[] = [
      { duration: 1850, staticDuration: 1800, distanceMeters: 30000 },
    ];
    const result = formatTravelOutput(routes, "car");
    expect(result).not.toContain("slower than usual");
    expect(result).toMatch(/about 31 minutes/);
  });

  it("includes best alternative by road name", () => {
    const routes: RouteInfo[] = [
      { duration: 2400, staticDuration: 2300, distanceMeters: 40000, description: "via Western Express Highway" },
      { duration: 2100, staticDuration: 2000, distanceMeters: 35000, description: "via Eastern Expressway" },
      { duration: 3000, staticDuration: 2900, distanceMeters: 50000, description: "via Sea Link" },
    ];
    const result = formatTravelOutput(routes, "car");
    expect(result).toContain("via Eastern Expressway is faster today at 35");
  });

  it("uses honorific when provided", () => {
    const routes: RouteInfo[] = [
      { duration: 1200, staticDuration: 1200, distanceMeters: 20000 },
    ];
    expect(formatTravelOutput(routes, "car", "madam")).toBe(
      "By car it's about 20 minutes, madam.",
    );
  });

  it("formats transit output with transitSummary", () => {
    const routes: RouteInfo[] = [
      { duration: 3300, staticDuration: 3300, distanceMeters: 60000, transitSummary: "mostly by train — Harbour line" },
    ];
    const result = formatTravelOutput(routes, "transit");
    expect(result).toContain("55 minutes");
    expect(result).toContain("mostly by train");
    expect(result).toContain("Harbour line");
  });

  it("formats transit output without transitSummary", () => {
    const routes: RouteInfo[] = [
      { duration: 1800, staticDuration: 1800, distanceMeters: 30000 },
    ];
    const result = formatTravelOutput(routes, "transit");
    expect(result).toContain("30 minutes");
    expect(result).not.toContain("mostly");
  });

  it("includes alternative for transit with transitSummary", () => {
    const routes: RouteInfo[] = [
      { duration: 3300, staticDuration: 3300, distanceMeters: 60000, transitSummary: "mostly by train — Harbour line" },
      { duration: 3000, staticDuration: 3000, distanceMeters: 50000, transitSummary: "mostly by bus" },
    ];
    const result = formatTravelOutput(routes, "transit");
    expect(result).toContain("mostly by bus — that one takes about 50");
  });

  it("returns empty string for empty routes", () => {
    expect(formatTravelOutput([], "car")).toBe("");
  });

  it("handles two_wheeler mode", () => {
    const routes: RouteInfo[] = [
      { duration: 1500, staticDuration: 1500, distanceMeters: 15000 },
    ];
    expect(formatTravelOutput(routes, "two_wheeler")).toContain("bike");
  });
});

// ── buildMapsUrl ─────────────────────────────────────────────────────────

describe("buildMapsUrl", () => {
  it("builds a valid Maps URL for car", () => {
    const url = buildMapsUrl("Home", "Work", "car");
    expect(url).toContain("google.com/maps/dir/");
    expect(url).toContain("api=1");
    expect(url).toContain("origin=Home");
    expect(url).toContain("destination=Work");
    expect(url).toContain("travelmode=driving");
  });

  it("uses transit travelmode for transit", () => {
    const url = buildMapsUrl("A", "B", "transit");
    expect(url).toContain("travelmode=transit");
  });

  it("uses driving for two_wheeler (Maps URL has no two_wheeler mode)", () => {
    const url = buildMapsUrl("A", "B", "two_wheeler");
    expect(url).toContain("travelmode=driving");
  });
});

// ── callGoogleRoutes ─────────────────────────────────────────────────────

describe("callGoogleRoutes (pure function)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  it("parses a standard response", async () => {
    mockRoutesResponse([
      {
        duration: "2450s",
        staticDuration: "2400s",
        distanceMeters: 40000,
        routeLabels: ["DEFAULT_ROUTE"],
        description: "via Western Express Highway",
      },
    ]);

    const routes = await callGoogleRoutes({
      origin: "Home",
      destination: "Work",
      mode: "car",
      alternatives: false,
      apiKey: "test-key",
    });

    expect(routes).toHaveLength(1);
    expect(routes[0].duration).toBe(2450);
    expect(routes[0].staticDuration).toBe(2400);
    expect(routes[0].distanceMeters).toBe(40000);
    expect(routes[0].description).toBe("via Western Express Highway");
  });

  it("derives transitSummary from vehicle types", async () => {
    mockRoutesResponse([
      {
        duration: "3300s",
        staticDuration: "3300s",
        distanceMeters: 60000,
        legs: [
          {
            steps: [
              { travelMode: "WALK" },
              {
                travelMode: "TRANSIT",
                transitDetails: {
                  transitLine: {
                    name: "Harbour line",
                    vehicle: { type: "TRAIN" },
                  },
                },
              },
              { travelMode: "WALK" },
            ],
          },
        ],
      },
    ]);

    const routes = await callGoogleRoutes({
      origin: "A", destination: "B", mode: "transit", alternatives: false, apiKey: "k",
    });

    expect(routes[0].transitSummary).toContain("mostly by train");
    expect(routes[0].transitSummary).toContain("Harbour line");
  });

  it("uses 'transit' label for unknown vehicle types", async () => {
    mockRoutesResponse([
      {
        duration: "600s",
        staticDuration: "600s",
        distanceMeters: 10000,
        legs: [
          {
            steps: [
              {
                travelMode: "TRANSIT",
                transitDetails: {
                  transitLine: {
                    name: "Unknown Line",
                    vehicle: { type: "SPACESHIP" },
                  },
                },
              },
            ],
          },
        ],
      },
    ]);

    const routes = await callGoogleRoutes({
      origin: "A", destination: "B", mode: "transit", alternatives: false, apiKey: "k",
    });

    expect(routes[0].transitSummary).toContain("mostly by transit");
  });

  it("sets transitSummary to undefined when no transit steps", async () => {
    mockRoutesResponse([
      {
        duration: "600s",
        staticDuration: "600s",
        distanceMeters: 10000,
        legs: [{ steps: [{ travelMode: "WALK" }, { travelMode: "WALK" }] }],
      },
    ]);

    const routes = await callGoogleRoutes({
      origin: "A", destination: "B", mode: "transit", alternatives: false, apiKey: "k",
    });

    expect(routes[0].transitSummary).toBeUndefined();
  });

  it("sends TRAFFIC_AWARE for car", async () => {
    mockRoutesResponse([]);

    await expect(
      callGoogleRoutes({
        origin: "A", destination: "B", mode: "car", alternatives: false, apiKey: "k",
      }),
    ).rejects.toThrow("No routes found");

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.routingPreference).toBe("TRAFFIC_AWARE");
    expect(body.travelMode).toBe("DRIVE");
  });

  it("sends TRAFFIC_AWARE for two_wheeler", async () => {
    mockRoutesResponse([]);
    await expect(
      callGoogleRoutes({
        origin: "A", destination: "B", mode: "two_wheeler", alternatives: false, apiKey: "k",
      }),
    ).rejects.toThrow("No routes found");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.routingPreference).toBe("TRAFFIC_AWARE");
    expect(body.travelMode).toBe("TWO_WHEELER");
  });

  it("omits routingPreference for transit", async () => {
    mockRoutesResponse([]);
    await expect(
      callGoogleRoutes({
        origin: "A", destination: "B", mode: "transit", alternatives: false, apiKey: "k",
      }),
    ).rejects.toThrow("No routes found");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.routingPreference).toBeUndefined();
    expect(body.travelMode).toBe("TRANSIT");
  });

  it("sends computeAlternativeRoutes", async () => {
    mockRoutesResponse([]);
    await expect(
      callGoogleRoutes({
        origin: "A", destination: "B", mode: "car", alternatives: true, apiKey: "k",
      }),
    ).rejects.toThrow("No routes found");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.computeAlternativeRoutes).toBe(true);
  });

  it("throws on API error", async () => {
    mockFetchError(403, "API key invalid");

    await expect(
      callGoogleRoutes({
        origin: "A", destination: "B", mode: "car", alternatives: false, apiKey: "bad",
      }),
    ).rejects.toThrow("Google Routes API error (403)");
  });

  it("sends the required X-Goog-FieldMask header with transit fields", async () => {
    mockRoutesResponse([]);
    await expect(
      callGoogleRoutes({
        origin: "A", destination: "B", mode: "car", alternatives: false, apiKey: "k",
      }),
    ).rejects.toThrow("No routes found");

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["X-Goog-FieldMask"]).toContain("routes.duration");
    expect(headers["X-Goog-FieldMask"]).toContain("routes.staticDuration");
    expect(headers["X-Goog-FieldMask"]).toContain("routes.distanceMeters");
    expect(headers["X-Goog-FieldMask"]).toContain("routes.routeLabels");
    expect(headers["X-Goog-FieldMask"]).toContain("routes.description");
    expect(headers["X-Goog-FieldMask"]).toContain("routes.legs.steps.travelMode");
    expect(headers["X-Goog-FieldMask"]).toContain("routes.legs.steps.transitDetails.transitLine.vehicle.type");
    expect(headers["X-Goog-FieldMask"]).toContain("routes.legs.steps.transitDetails.transitLine.name");
  });
});

// ── getTravelTimeTool ────────────────────────────────────────────────────

describe("getTravelTimeTool", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    mockGetSecret.mockReset();
    mockGetSecret.mockResolvedValue("test-key");
    mockGetResponseSettings.mockReturnValue({
      responseLength: "auto",
      language: "english",
      autoScroll: true,
      honorific: "sir",
      voiceMaxTokens: 100,
      voiceModel: "",
    });
  });

  it("returns error on missing args", async () => {
    const result = await getTravelTimeTool.run({}, { vars: {} });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing required args");
  });

  it("returns error on invalid mode", async () => {
    const result = await getTravelTimeTool.run(
      { from: "A", to: "B", mode: "rocket" },
      { vars: {} },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid mode");
  });

  it("falls back to URL when no API key — uses 'add key' message", async () => {
    mockGetSecret.mockResolvedValue(null);

    const result = await getTravelTimeTool.run(
      { from: "Home", to: "Work", mode: "car" },
      { vars: {} },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("Add a Maps API key in Settings");
    expect(result.data?.fallback).toBe("true");
    expect(result.data?.url).toContain("google.com/maps/dir/");
    expect(result.data?.url).toContain("origin=Home");
    expect(result.data?.url).toContain("destination=Work");
    expect(result.data?.url).toContain("travelmode=driving");
  });

  it("falls back to URL on Google API error — uses 'did not go through' message, not 'add key'", async () => {
    mockFetchError(403, "quota exceeded");

    const result = await getTravelTimeTool.run(
      { from: "A", to: "B" },
      { vars: {} },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("didn't go through this time");
    expect(result.output).not.toContain("Add a Maps API key");
    expect(result.data?.fallback).toBe("true");
  });

  it("uses configured honorific from settings", async () => {
    mockGetResponseSettings.mockReturnValue({
      responseLength: "auto",
      language: "english",
      autoScroll: true,
      honorific: "madam",
      voiceMaxTokens: 100,
      voiceModel: "",
    });

    mockRoutesResponse([
      {
        duration: "1200s",
        staticDuration: "1200s",
        distanceMeters: 20000,
        routeLabels: ["DEFAULT_ROUTE"],
      },
    ]);

    const result = await getTravelTimeTool.run(
      { from: "Home", to: "Work", mode: "car" },
      { vars: {} },
    );

    expect(result.output).toContain("madam");
    expect(result.output).not.toContain("sir");
  });

  it("returns formatted output on success", async () => {
    mockRoutesResponse([
      {
        duration: "2400s",
        staticDuration: "2350s",
        distanceMeters: 40000,
        routeLabels: ["DEFAULT_ROUTE"],
        description: "via Western Express Highway",
      },
    ]);

    const result = await getTravelTimeTool.run(
      { from: "Home", to: "Work", mode: "car" },
      { vars: {} },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("40 minutes");
    expect(result.data?.fallback).toBe("false");
  });

  it("uses args.from and args.to", async () => {
    mockRoutesResponse([
      {
        duration: "600s",
        staticDuration: "600s",
        distanceMeters: 5000,
        routeLabels: ["DEFAULT_ROUTE"],
      },
    ]);

    const result = await getTravelTimeTool.run(
      { from: "Airport", to: "Hotel" },
      { vars: {} },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("10 minutes");
  });
});
