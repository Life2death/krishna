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

vi.mock("@krishna/core/database", () => ({
  getAllMemories: vi.fn().mockResolvedValue([]),
}));

import { setHttpFetch } from "@krishna/core/http";
import { resolvePlace } from "@krishna/core/tools/place-resolver";
import {
  getTravelTimeTool,
  suggestDepartureTimeTool,
  formatTravelOutput,
  buildMapsUrl,
  callGoogleRoutes,
  sampleDepartures,
  type RouteInfo,
  type TravelMode,
  type DepartureSample,
  type SampleDeparturesParams,
} from "@krishna/core/tools/get-travel-time";
import { getAllMemories } from "@krishna/core/database";

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

  it("speaks only first road segment when description is slash-joined", () => {
    const routes: RouteInfo[] = [
      { duration: 2400, staticDuration: 2300, distanceMeters: 40000, description: "via Western Express Highway" },
      { duration: 1800, staticDuration: 1700, distanceMeters: 30000, description: "Bengaluru - Mumbai Hwy/Mumbai Hwy/Mumbai - Pandharpur Rd/Mumbai - Pune Hwy" },
    ];
    const result = formatTravelOutput(routes, "car");
    expect(result).toContain("Bengaluru - Mumbai Hwy is faster today at 30");
    expect(result).not.toContain("/");
  });

  it("drops faster alternative clause when first segment is empty", () => {
    const routes: RouteInfo[] = [
      { duration: 2400, staticDuration: 2300, distanceMeters: 40000, description: "via Western Express Highway" },
      { duration: 1800, staticDuration: 1700, distanceMeters: 30000, description: "/Mumbai Hwy/Pune Hwy" },
    ];
    const result = formatTravelOutput(routes, "car");
    expect(result).not.toContain("is faster today");
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
    setHttpFetch(mockFetch);
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

  it("omits departureTime when not set", async () => {
    mockRoutesResponse([]);
    await expect(
      callGoogleRoutes({
        origin: "A", destination: "B", mode: "car", alternatives: false, apiKey: "k",
      }),
    ).rejects.toThrow("No routes found");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.departureTime).toBeUndefined();
  });

  it("includes departureTime in body when set", async () => {
    mockRoutesResponse([]);
    const dt = new Date(Date.now() + 3600000).toISOString(); // 1h from now

    await expect(
      callGoogleRoutes({
        origin: "A", destination: "B", mode: "car", alternatives: false, apiKey: "k", departureTime: dt,
      }),
    ).rejects.toThrow("No routes found");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.departureTime).toBe(dt);
  });

  it("applies now+60s floor when departureTime is in the past", async () => {
    mockRoutesResponse([]);
    const past = new Date(Date.now() - 60000).toISOString();

    await expect(
      callGoogleRoutes({
        origin: "A", destination: "B", mode: "car", alternatives: false, apiKey: "k", departureTime: past,
      }),
    ).rejects.toThrow("No routes found");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(new Date(body.departureTime).getTime()).toBeGreaterThan(Date.now() - 1000);
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

// ── sampleDepartures ──────────────────────────────────────────────────────

describe("sampleDepartures", () => {
  const baseParams: SampleDeparturesParams = {
    origin: "Home",
    destination: "Work",
    mode: "car",
    apiKey: "test-key",
  };

  beforeEach(() => {
    mockFetch.mockReset();
    setHttpFetch(mockFetch);
    vi.stubGlobal("fetch", mockFetch);
  });

  it("samples at 30-minute intervals up to window_hours, capped at 8", async () => {
    for (let i = 0; i < 8; i++) {
      mockRoutesResponse([{ duration: "1800s", staticDuration: "1800s", distanceMeters: 20000 }]);
    }

    const result = await sampleDepartures({ ...baseParams, window_hours: 12 });

    expect(result.samples).toHaveLength(8);
    expect(result.failures).toBe(0);

    // Verify increasing timestamps
    for (let i = 1; i < result.samples.length; i++) {
      const prev = new Date(result.samples[i - 1].departureTime).getTime();
      const curr = new Date(result.samples[i].departureTime).getTime();
      expect(curr - prev).toBeGreaterThanOrEqual(29 * 60 * 1000);
    }
  });

  it("defaults to 7 samples for 3-hour window", async () => {
    for (let i = 0; i < 7; i++) {
      mockRoutesResponse([{ duration: "1800s", staticDuration: "1800s", distanceMeters: 20000 }]);
    }

    const result = await sampleDepartures(baseParams);

    expect(result.samples).toHaveLength(7);
    expect(result.failures).toBe(0);
  });

  it("returns all samples with correct duration data", async () => {
    const durations = [1800, 1500, 2100, 2400, 1950, 2200, 1700];
    for (const d of durations) {
      mockRoutesResponse([{ duration: `${d}s`, staticDuration: "1800s", distanceMeters: 20000 }]);
    }

    const result = await sampleDepartures(baseParams);

    expect(result.samples).toHaveLength(7);
    expect(result.samples.every((s) => s.ok)).toBe(true);
    expect(result.samples[1].duration).toBe(1500); // lowest — "best"
  });

  it("continues on partial failure and records errorReason", async () => {
    mockRoutesResponse([{ duration: "1800s", staticDuration: "1800s", distanceMeters: 20000 }]);
    mockFetchError(500, "Internal error");
    mockRoutesResponse([{ duration: "2100s", staticDuration: "2000s", distanceMeters: 22000 }]);
    mockRoutesResponse([{ duration: "1950s", staticDuration: "1950s", distanceMeters: 21000 }]);
    mockRoutesResponse([{ duration: "1700s", staticDuration: "1700s", distanceMeters: 19000 }]);
    mockRoutesResponse([{ duration: "1900s", staticDuration: "1800s", distanceMeters: 20000 }]);
    mockRoutesResponse([{ duration: "2000s", staticDuration: "1900s", distanceMeters: 20500 }]);

    const result = await sampleDepartures(baseParams);

    expect(result.samples).toHaveLength(7);
    expect(result.failures).toBe(1);
    expect(result.samples[0].ok).toBe(true);
    expect(result.samples[1].ok).toBe(false);
    expect(result.samples[1].errorReason).toContain("500");
    expect(result.samples[1].duration).toBeUndefined();
  });

  it("throws on total failure with first real reason", async () => {
    for (let i = 0; i < 7; i++) {
      mockFetchError(403, "API key expired");
    }

    await expect(sampleDepartures(baseParams)).rejects.toThrow("API key expired");
  });

  it("respects AbortSignal mid-sampling", async () => {
    const controller = new AbortController();
    mockRoutesResponse([{ duration: "1800s", staticDuration: "1800s", distanceMeters: 20000 }]);
    controller.abort();

    const params = { ...baseParams, signal: controller.signal };
    await expect(sampleDepartures(params)).rejects.toThrow("The operation was aborted");
  });
});

// ── suggestDepartureTimeTool ──────────────────────────────────────────────

describe("suggestDepartureTimeTool", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setHttpFetch(mockFetch);
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
    // "home"/"work" resolve to real saved addresses by default so existing
    // tests exercise the routes-calling path, not the unresolved-placeholder
    // guard (see dedicated guard tests below).
    vi.mocked(getAllMemories).mockResolvedValue([
      { id: "1", key: "home address", value: "123 Main St", confirmed: 1, source: "user", createdAt: 0, lastUsedAt: null },
      { id: "2", key: "work address", value: "456 Oak Ave", confirmed: 1, source: "user", createdAt: 0, lastUsedAt: null },
    ]);
  });

  it("returns best departure suggestion when a later sample is better", async () => {
    // 7 samples: durations increase then a dip at index 4
    const durations = [3200, 3100, 3000, 2900, 2400, 2800, 3100];
    for (const d of durations) {
      mockRoutesResponse([{ duration: `${d}s`, staticDuration: `${d - 100}s`, distanceMeters: 20000 }]);
    }

    const result = await suggestDepartureTimeTool.run(
      { from: "home", to: "work", mode: "car" },
      { vars: {} },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("If you wait until");
    expect(result.data?.bestDuration).toBe("2400");
    expect(result.data?.samples).toBeTruthy();
  });

  it("says now is best when first sample has minimum duration", async () => {
    const durations = [1800, 2000, 2100, 2200, 2300, 2400, 2500];
    for (const d of durations) {
      mockRoutesResponse([{ duration: `${d}s`, staticDuration: `${d - 100}s`, distanceMeters: 20000 }]);
    }

    const result = await suggestDepartureTimeTool.run(
      { from: "home", to: "work", mode: "car" },
      { vars: {} },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("now is as good as it gets");
    expect(result.output).toContain("30 minutes"); // 1800s = 30 min
  });

  it("returns error when all samples fail", async () => {
    for (let i = 0; i < 7; i++) {
      mockFetchError(500, "Internal error");
    }

    const result = await suggestDepartureTimeTool.run(
      { from: "home", to: "work", mode: "car" },
      { vars: {} },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("couldn't check departure times");
  });

  it("returns error when API key is missing", async () => {
    mockGetSecret.mockResolvedValue(null);

    const result = await suggestDepartureTimeTool.run(
      { from: "home", to: "work", mode: "car" },
      { vars: {} },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("API key is not configured");
  });

  it("returns error for invalid mode", async () => {
    const result = await suggestDepartureTimeTool.run(
      { from: "home", to: "work", mode: "flying" },
      { vars: {} },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid mode");
  });

  it("returns a helpful error when the destination (work) address isn't saved", async () => {
    vi.mocked(getAllMemories).mockResolvedValue([]);

    const result = await suggestDepartureTimeTool.run(
      { from: "Somewhere Real", to: "work", mode: "car" },
      { vars: {} },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("work address");
    expect(result.error).toContain('remember my work address is');
  });

  it("uses passed window_hours", async () => {
    const durations = [3200, 3000, 2800, 2600, 2400];
    for (const d of durations) {
      mockRoutesResponse([{ duration: `${d}s`, staticDuration: `${d - 100}s`, distanceMeters: 20000 }]);
    }

    const result = await suggestDepartureTimeTool.run(
      { from: "home", to: "work", mode: "car", window_hours: "2" },
      { vars: {} },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("next 2 hours");
    // 2h window with 2h window_hours = 5 samples (now + 4 × 30min = within 2h)
    const parsed = JSON.parse(result.data!.samples);
    expect(parsed).toHaveLength(5);
  });
});

// ── getTravelTimeTool ────────────────────────────────────────────────────

describe("getTravelTimeTool", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setHttpFetch(mockFetch);
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
    // "home"/"work" resolve to real saved addresses by default so existing
    // tests exercise the routes-calling path, not the unresolved-placeholder
    // guard (see dedicated guard tests below).
    vi.mocked(getAllMemories).mockResolvedValue([
      { id: "1", key: "home address", value: "123 Main St", confirmed: 1, source: "user", createdAt: 0, lastUsedAt: null },
      { id: "2", key: "work address", value: "456 Oak Ave", confirmed: 1, source: "user", createdAt: 0, lastUsedAt: null },
    ]);
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

  it("returns a helpful error when the origin (home) address isn't saved", async () => {
    vi.mocked(getAllMemories).mockResolvedValue([]);

    const result = await getTravelTimeTool.run(
      { from: "home", to: "Somewhere Real" },
      { vars: {} },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("home address");
    expect(result.error).toContain('remember my home address is');
  });

  it("returns a helpful error when the destination (work) address isn't saved", async () => {
    vi.mocked(getAllMemories).mockResolvedValue([]);

    const result = await getTravelTimeTool.run(
      { from: "Somewhere Real", to: "work" },
      { vars: {} },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("work address");
    expect(result.error).toContain('remember my work address is');
  });

  it("does not block real place names that pass through resolvePlace unchanged", async () => {
    vi.mocked(getAllMemories).mockResolvedValue([]);
    mockRoutesResponse([
      { duration: "600s", staticDuration: "600s", distanceMeters: 5000, routeLabels: ["DEFAULT_ROUTE"] },
    ]);

    const result = await getTravelTimeTool.run(
      { from: "Rahul's place", to: "Airport" },
      { vars: {} },
    );

    expect(result.success).toBe(true);
    expect(result.data?.fallback).toBe("false");
  });

  it("falls back to URL when no API key — uses 'add key' message", async () => {
    mockGetSecret.mockResolvedValue(null);

    const result = await getTravelTimeTool.run(
      { from: "Home", to: "Work", mode: "car" },
      { vars: {} },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Add a Maps API key in Settings");
    expect(result.data?.fallback).toBe("true");
    expect(result.data?.url).toContain("google.com/maps/dir/");
    expect(result.data?.url).toContain("origin=123"); // resolved via saved "home address" memory
    expect(result.data?.url).toContain("destination=456"); // resolved via saved "work address" memory
    expect(result.data?.url).toContain("travelmode=driving");
  });

  it("falls back to URL on Google API error — uses 'did not go through' message, not 'add key'", async () => {
    mockFetchError(403, "quota exceeded");

    const result = await getTravelTimeTool.run(
      { from: "A", to: "B" },
      { vars: {} },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("didn't go through this time");
    expect(result.error).not.toContain("Add a Maps API key");
    expect(result.data?.fallback).toBe("true");
    expect(result.data?.errorDetail).toContain("Google Routes API error (403)");
  });

  it("no routes found produces a distinguishable error detail", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ routes: [] }),
    });

    const result = await getTravelTimeTool.run(
      { from: "A", to: "B" },
      { vars: {} },
    );

    expect(result.success).toBe(false);
    expect(result.data?.fallback).toBe("true");
    expect(result.data?.errorDetail).toContain("No routes found");
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

// ── resolvePlace ──────────────────────────────────────────────────────────

describe("resolvePlace", () => {
  const mockGetAllMemories = vi.mocked(getAllMemories);

  beforeEach(() => {
    mockGetAllMemories.mockReset();
  });

  it("returns address for exact memory key match", async () => {
    mockGetAllMemories.mockResolvedValue([
      { id: "1", key: "home address", value: "123 Main St", confirmed: 1, source: "user", createdAt: 0, lastUsedAt: null },
    ]);
    expect(await resolvePlace("home address")).toBe("123 Main St");
  });

  it("matches noise-stripped key (home → home address)", async () => {
    mockGetAllMemories.mockResolvedValue([
      { id: "1", key: "home address", value: "123 Main St", confirmed: 1, source: "user", createdAt: 0, lastUsedAt: null },
    ]);
    expect(await resolvePlace("home")).toBe("123 Main St");
  });

  it("passes through unknown place names", async () => {
    mockGetAllMemories.mockResolvedValue([
      { id: "1", key: "home address", value: "123 Main St", confirmed: 1, source: "user", createdAt: 0, lastUsedAt: null },
    ]);
    expect(await resolvePlace("Rahul's place")).toBe("Rahul's place");
  });

  it("passes through Devanagari place names", async () => {
    mockGetAllMemories.mockResolvedValue([
      { id: "1", key: "home address", value: "123 Main St", confirmed: 1, source: "user", createdAt: 0, lastUsedAt: null },
    ]);
    expect(await resolvePlace("मुंबई")).toBe("मुंबई");
  });

  it("returns empty string for empty input", async () => {
    mockGetAllMemories.mockResolvedValue([]);
    expect(await resolvePlace("")).toBe("");
  });

  it("is case-insensitive when matching", async () => {
    mockGetAllMemories.mockResolvedValue([
      { id: "1", key: "Home Address", value: "456 Oak Ave", confirmed: 1, source: "user", createdAt: 0, lastUsedAt: null },
    ]);
    expect(await resolvePlace("home address")).toBe("456 Oak Ave");
  });

  it("matches work address from memory", async () => {
    mockGetAllMemories.mockResolvedValue([
      { id: "1", key: "home address", value: "123 Main St", confirmed: 1, source: "user", createdAt: 0, lastUsedAt: null },
      { id: "2", key: "work address", value: "456 Oak Ave", confirmed: 1, source: "user", createdAt: 0, lastUsedAt: null },
    ]);
    expect(await resolvePlace("work")).toBe("456 Oak Ave");
  });

  it("ignores unconfirmed memories", async () => {
    mockGetAllMemories.mockResolvedValue([
      { id: "1", key: "home address", value: "123 Main St", confirmed: 0, source: "user", createdAt: 0, lastUsedAt: null },
    ]);
    expect(await resolvePlace("home")).toBe("home");
  });
});
