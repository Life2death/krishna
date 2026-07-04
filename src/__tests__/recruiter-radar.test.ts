import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import {
  checkRecruiters,
  formatRecruiterOutput,
  formatSince,
  Candidate,
  Classification,
  MAX_CANDIDATES,
} from "@krishna/core/tools/recruiter-radar";

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "msg1",
    from: "priya@abcconsultants.com",
    subject: "Delivery Head role at ABC",
    snippet: "We have an exciting opportunity...",
    ...overrides,
  };
}

function makeClassify(
  overrides: Partial<Classification> = {},
): Classification {
  return {
    id: "msg1",
    class: "recruiter_outreach",
    via: "direct",
    ...overrides,
  };
}

describe("checkRecruiters", () => {
  it("returns empty result for zero candidates", async () => {
    const classify = vi.fn();
    const result = await checkRecruiters([], classify);
    expect(result.outreach).toHaveLength(0);
    expect(result.totalFetched).toBe(0);
    expect(result.degraded).toBe(false);
    expect(classify).not.toHaveBeenCalled();
  });

  it("filters recruiter_outreach from classified results", async () => {
    const candidates: Candidate[] = [
      makeCandidate({ id: "m1", from: "hr@company.com", subject: "Job opening" }),
      makeCandidate({ id: "m2", from: "jobs@linkedin.com", subject: "New jobs for you" }),
      makeCandidate({ id: "m3", from: "recruiter@agency.com", subject: "Senior role" }),
    ];
    const classify = vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue([
      makeClassify({ id: "m1", class: "recruiter_outreach", recruiterName: "HR Team", company: "Company Inc" }),
      makeClassify({ id: "m2", class: "job_alert_digest", via: "linkedin" }),
      makeClassify({ id: "m3", class: "recruiter_outreach", roleTitle: "Senior Engineer" }),
    ]);

    const result = await checkRecruiters(candidates, classify as any);
    expect(result.outreach).toHaveLength(2);
    expect(result.outreach[0].id).toBe("m1");
    expect(result.outreach[1].id).toBe("m3");
    expect(result.degraded).toBe(false);
    expect(result.totalFetched).toBe(3);
  });

  it("falls back to heuristic when classify fails", async () => {
    const candidates: Candidate[] = [
      makeCandidate({ id: "m1", from: "hr@company.com", subject: "JD for Senior Developer" }),
      makeCandidate({ id: "m2", from: "jobs-noreply@linkedin.com", subject: "New jobs for you" }),
      makeCandidate({ id: "m3", from: "noreply@naukri.com", subject: "Recruiter contacted you" }),
    ];
    const classify = vi.fn<(...args: unknown[]) => unknown>().mockRejectedValue(new Error("API error"));

    const result = await checkRecruiters(candidates, classify as any);
    expect(result.degraded).toBe(true);
    expect(result.error).toBe("API error");

    expect(result.outreach).toHaveLength(1);
    expect(result.outreach[0].id).toBe("m1");
  });

  it("falls back to heuristic when classify returns invalid output", async () => {
    const candidates: Candidate[] = [
      makeCandidate({ id: "m1", from: "a@b.com", subject: "Job opportunity" }),
    ];
    const classify = vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue([{ id: "unknown", class: "recruiter_outreach" }]);

    const result = await checkRecruiters(candidates, classify as any);
    expect(result.degraded).toBe(true);
    expect(result.outreach).toHaveLength(1);
  });

  it("sets capHit true when candidate count equals MAX", async () => {
    const candidates: Candidate[] = Array.from({ length: MAX_CANDIDATES }, (_, i) =>
      makeCandidate({ id: `m${i}`, subject: "Job" }),
    );
    const classify = vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue(
      candidates.map((c) => makeClassify({ id: c.id, class: "other" })),
    );

    const result = await checkRecruiters(candidates, classify as any);
    expect(result.capHit).toBe(true);
    expect(result.totalFetched).toBe(MAX_CANDIDATES);
  });

  it("accepts explicit capHit from fetch layer", async () => {
    const candidates: Candidate[] = [
      makeCandidate({ id: "m1" }),
    ];
    const classify = vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue([
      makeClassify({ id: "m1", class: "other" }),
    ]);
    const result = await checkRecruiters(candidates, classify as any, true);
    expect(result.capHit).toBe(true);
  });

  it("rejects non-bijection (duplicate id, omitted id)", async () => {
    const candidates: Candidate[] = [
      makeCandidate({ id: "m1" }),
      makeCandidate({ id: "m2" }),
    ];
    const classify = vi.fn<(...args: unknown[]) => unknown>().mockResolvedValue([
      makeClassify({ id: "m1", class: "recruiter_outreach" }),
      makeClassify({ id: "m1", class: "recruiter_outreach" }),
    ]);
    const result = await checkRecruiters(candidates, classify as any);
    expect(result.degraded).toBe(true);
    expect(result.error).toContain("validation failed");
  });
});

describe("formatRecruiterOutput — zero outreach", () => {
  it('says "No new recruiter emails since..."', () => {
    const output = formatRecruiterOutput([], [], { since: Date.now() - 3600000, capHit: false, degraded: false });
    expect(output).toContain("No new recruiter emails");
  });

  it("includes hedge when degraded", () => {
    const output = formatRecruiterOutput([], [], { since: Date.now() - 3600000, capHit: false, degraded: true });
    expect(output).toContain("Roughly");
    expect(output).toContain("running blind");
  });

  it("includes cap note when capHit", () => {
    const output = formatRecruiterOutput([], [], { since: Date.now() - 3600000, capHit: true, degraded: false });
    expect(output).toContain(`last ${MAX_CANDIDATES} messages`);
  });
});

describe("formatRecruiterOutput — with outreach", () => {
  const candidates: Candidate[] = [
    makeCandidate({ id: "m1", from: "priya@abc.com", subject: "Delivery Head" }),
    makeCandidate({ id: "m2", from: "raj@xyz.com", subject: "Senior role" }),
    makeCandidate({ id: "m3", from: "linkedin-noreply@linkedin.com", subject: "InMail" }),
    makeCandidate({ id: "m4", from: "noreply@naukri.com", subject: "Recruiter contact" }),
  ];

  const outreach: Classification[] = [
    makeClassify({ id: "m1", recruiterName: "Priya", company: "ABC Consultants", via: "direct" }),
    makeClassify({ id: "m2", roleTitle: "Senior Engineer", via: "direct" }),
    makeClassify({ id: "m3", via: "linkedin" }),
    makeClassify({ id: "m4", via: "naukri" }),
  ];

  it("shows top 3 briefs", () => {
    const output = formatRecruiterOutput(outreach, candidates, {
      since: Date.now() - 86400000,
      capHit: false,
      degraded: false,
    });
    expect(output).toContain("Priya from ABC Consultants");
    expect(output).toContain("about a Senior Engineer role");
    expect(output).toContain("via linkedin");
    expect(output).not.toContain("4 more"); // 4 items, cap at 3 = 1 extra
  });

  it("shows extra count when >3", () => {
    const manyOutreach = [...outreach, makeClassify({ id: "m5", via: "direct" })];
    const manyCandidates = [...candidates, makeCandidate({ id: "m5", from: "x@y.com", subject: "Role" })];
    const output = formatRecruiterOutput(manyOutreach, manyCandidates, {
      since: Date.now() - 86400000,
      capHit: false,
      degraded: false,
    });
    expect(output).toContain("2 more");
  });

  it("has correct line count for 4 items (3 briefs + 1 count line)", () => {
    const output = formatRecruiterOutput(outreach, candidates, {
      since: Date.now() - 86400000,
      capHit: false,
      degraded: false,
    });
    const lines = output.split("\n");
    expect(lines).toHaveLength(4); // 3 briefs + "…and 1 more"
  });

  it("falls back to sender+subject when no extraction data", () => {
    const bareOutreach: Classification[] = [makeClassify({ id: "m1", recruiterName: undefined, company: undefined, roleTitle: undefined, via: "direct" })];
    const output = formatRecruiterOutput(bareOutreach, candidates, {
      since: Date.now() - 86400000,
      capHit: false,
      degraded: false,
    });
    expect(output).toContain("priya");
    expect(output).not.toContain("@");
    expect(output).toContain("Delivery Head");
  });

  it("strips angle-bracket email in fallback brief", () => {
    const candWithBrackets: Candidate[] = [makeCandidate({ id: "x1", from: "Priya Singh <priya@abc.com>", subject: "Role" })];
    const bareOutreach: Classification[] = [makeClassify({ id: "x1", recruiterName: undefined, company: undefined, roleTitle: undefined, via: "direct" })];
    const output = formatRecruiterOutput(bareOutreach, candWithBrackets, {
      since: Date.now() - 86400000,
      capHit: false,
      degraded: false,
    });
    expect(output).toContain("Priya Singh");
    expect(output).not.toContain("priya@abc.com");
  });
});

describe("formatSince", () => {
  const FIXED_NOW = new Date("2026-07-05T15:00:00");

  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for recent timestamps', () => {
    expect(formatSince(Date.now() - 1000)).toBe("just now");
  });

  it("returns minutes for <1 hour", () => {
    expect(formatSince(Date.now() - 60000 * 5)).toBe("5 minutes ago");
  });

  it("returns 1 minute ago singular", () => {
    expect(formatSince(Date.now() - 60000)).toBe("1 minute ago");
  });

  it("returns hours for <6 hours", () => {
    expect(formatSince(Date.now() - 3600000 * 3)).toBe("3 hours ago");
  });

  it('returns "this morning" when timestamp falls in morning hours', () => {
    const d = new Date(FIXED_NOW);
    d.setHours(8, 0, 0, 0);
    expect(formatSince(d.getTime())).toBe("this morning");
  });

  it('returns "earlier today" for pre-dawn timestamp', () => {
    const d = new Date(FIXED_NOW);
    d.setHours(2, 0, 0, 0);
    expect(formatSince(d.getTime())).toBe("earlier today");
  });

  it('returns "yesterday" for 1 day', () => {
    expect(formatSince(Date.now() - 86400000)).toBe("yesterday");
  });

  it("returns days for <7 days", () => {
    expect(formatSince(Date.now() - 86400000 * 3)).toBe("3 days ago");
  });

  it('returns "last week" for 7-13 days', () => {
    expect(formatSince(Date.now() - 86400000 * 10)).toBe("last week");
  });

  it("returns weeks for 14-29 days", () => {
    expect(formatSince(Date.now() - 86400000 * 17)).toBe("2 weeks ago");
  });
});

// ── R2: State module (recruiter-radar-state) ──────────────────────────────

describe("recruiter radar state", () => {
  const store = new Map<string, { value: number }>();
  const seenStore = new Map<string, { message_id: string; first_seen_at: number }>();

  const mockDriver = {
    select: vi.fn((sql: string, _params?: unknown[]) => {
      if (sql.includes("FROM recruiter_radar_state")) {
        const rows = [...store.values()];
        return Promise.resolve(rows.length > 0 ? [rows[0]] : []);
      }
      if (sql.includes("FROM recruiter_seen")) {
        return Promise.resolve([...seenStore.values()]);
      }
      return Promise.resolve([]);
    }),
    execute: vi.fn((sql: string, params?: unknown[]) => {
      if (sql.includes("INSERT OR REPLACE INTO recruiter_radar_state")) {
        const key = sql.includes("'last_check_at'") ? 'last_check_at' : String(params?.[0] ?? "");
        const val = Number(params?.[params.length - 1] ?? 0);
        store.set(key, { value: val });
        return Promise.resolve({ rowsAffected: 1, lastInsertId: undefined });
      }
      if (sql.includes("INSERT OR IGNORE INTO recruiter_seen")) {
        const id = String(params?.[0]);
        if (!seenStore.has(id)) {
          seenStore.set(id, { message_id: id, first_seen_at: Number(params?.[params.length - 1]) });
        }
        return Promise.resolve({ rowsAffected: 1, lastInsertId: undefined });
      }
      return Promise.resolve({ rowsAffected: 0, lastInsertId: undefined });
    }),
  };

  let getLastCheckAt: typeof import("@krishna/core/tools/recruiter-radar-state").getLastCheckAt;
  let setLastCheckAt: typeof import("@krishna/core/tools/recruiter-radar-state").setLastCheckAt;
  let getSeenIds: typeof import("@krishna/core/tools/recruiter-radar-state").getSeenIds;
  let markSeen: typeof import("@krishna/core/tools/recruiter-radar-state").markSeen;
  let setDriver: typeof import("@krishna/core/database/driver").setDriver;

  beforeEach(async () => {
    store.clear();
    seenStore.clear();
    mockDriver.select.mockClear();
    mockDriver.execute.mockClear();
    const state = await import("@krishna/core/tools/recruiter-radar-state");
    getLastCheckAt = state.getLastCheckAt;
    setLastCheckAt = state.setLastCheckAt;
    getSeenIds = state.getSeenIds;
    markSeen = state.markSeen;
    const driverMod = await import("@krishna/core/database/driver");
    setDriver = driverMod.setDriver;
    setDriver(mockDriver as any);
  });

  it("returns 0 for cold-start lastCheckAt", async () => {
    const ts = await getLastCheckAt();
    expect(ts).toBe(0);
  });

  it("persists and retrieves lastCheckAt", async () => {
    const now = Date.now();
    await setLastCheckAt(now);
    const ts = await getLastCheckAt();
    expect(ts).toBe(now);
  });

  it("returns empty set for cold-start seen ids", async () => {
    const ids = await getSeenIds();
    expect(ids.size).toBe(0);
  });

  it("marks ids as seen and retrieves them", async () => {
    await markSeen(["m1", "m2", "m3"], 1000);
    const ids = await getSeenIds();
    expect(ids.has("m1")).toBe(true);
    expect(ids.has("m2")).toBe(true);
    expect(ids.has("m3")).toBe(true);
    expect(ids.has("m4")).toBe(false);
  });

  it("markSeen is idempotent (INSERT OR IGNORE)", async () => {
    await markSeen(["m1"], 1000);
    await markSeen(["m1"], 2000);
    const ids = await getSeenIds();
    expect(ids.size).toBe(1);
  });

  it("second ask same day returns nothing new (load-bearing)", async () => {
    await setLastCheckAt(1000);

    // First ask: fetch + classify 2 candidates
    const candidates: Candidate[] = [
      makeCandidate({ id: "m1", from: "hr@co.com", subject: "Job opening" }),
      makeCandidate({ id: "m2", from: "jobs@linkedin.com", subject: "Digest" }),
    ];
    const classify = vi.fn().mockResolvedValue([
      makeClassify({ id: "m1", class: "recruiter_outreach", recruiterName: "HR" }),
      makeClassify({ id: "m2", class: "job_alert_digest", via: "linkedin" }),
    ]);
    const result1 = await checkRecruiters(candidates, classify as any);
    const newIds1 = result1.outreach.map((c) => c.id);
    expect(newIds1).toEqual(["m1"]);

    // Mark ALL candidates as seen (not just outreach)
    await markSeen(candidates.map((c) => c.id), Date.now());
    await setLastCheckAt(Date.now());

    // Second ask: same candidates, same classify
    const result2 = await checkRecruiters(candidates, classify as any);
    const seen = await getSeenIds();
    const newOutreach = result2.outreach.filter((o) => !seen.has(o.id));
    expect(newOutreach).toHaveLength(0);
  });
});

describe("runRecruiterRadar", () => {
  let runRecruiterRadar: typeof import("@krishna/core/tools/recruiter-radar").runRecruiterRadar;
  let getLastCheckAt: typeof import("@krishna/core/tools/recruiter-radar-state").getLastCheckAt;
  let setLastCheckAt: typeof import("@krishna/core/tools/recruiter-radar-state").setLastCheckAt;
  let getSeenIds: typeof import("@krishna/core/tools/recruiter-radar-state").getSeenIds;
  let markSeen: typeof import("@krishna/core/tools/recruiter-radar-state").markSeen;
  let setDriver: typeof import("@krishna/core/database/driver").setDriver;

  const store = new Map<string, { value: number }>();
  const seenStore = new Map<string, { message_id: string; first_seen_at: number }>();

  const mockDriver = {
    select: vi.fn((sql: string, _params?: unknown[]) => {
      if (sql.includes("FROM recruiter_radar_state")) {
        const rows = [...store.values()];
        return Promise.resolve(rows.length > 0 ? [rows[0]] : []);
      }
      if (sql.includes("FROM recruiter_seen")) {
        return Promise.resolve([...seenStore.values()]);
      }
      return Promise.resolve([]);
    }),
    execute: vi.fn((sql: string, params?: unknown[]) => {
      if (sql.includes("INSERT OR REPLACE INTO recruiter_radar_state")) {
        const val = Number(params?.[params.length - 1] ?? 0);
        store.set("last_check_at", { value: val });
        return Promise.resolve({ rowsAffected: 1, lastInsertId: undefined });
      }
      if (sql.includes("INSERT OR IGNORE INTO recruiter_seen")) {
        const id = String(params?.[0]);
        if (!seenStore.has(id)) {
          seenStore.set(id, { message_id: id, first_seen_at: Number(params?.[params.length - 1]) });
        }
        return Promise.resolve({ rowsAffected: 1, lastInsertId: undefined });
      }
      return Promise.resolve({ rowsAffected: 0, lastInsertId: undefined });
    }),
  };

  beforeEach(async () => {
    store.clear();
    seenStore.clear();
    mockDriver.select.mockClear();
    mockDriver.execute.mockClear();
    const radar = await import("@krishna/core/tools/recruiter-radar");
    runRecruiterRadar = radar.runRecruiterRadar;
    const state = await import("@krishna/core/tools/recruiter-radar-state");
    getLastCheckAt = state.getLastCheckAt;
    setLastCheckAt = state.setLastCheckAt;
    getSeenIds = state.getSeenIds;
    markSeen = state.markSeen;
    const driverMod = await import("@krishna/core/database/driver");
    setDriver = driverMod.setDriver;
    setDriver(mockDriver as any);
  });

  it("bare ask filters outreach to unseen ids", async () => {
    await setLastCheckAt(1000);
    await markSeen(["m1"], 1000);

    const candidates: Candidate[] = [
      makeCandidate({ id: "m1", from: "hr@co.com", subject: "Job opening" }),
      makeCandidate({ id: "m2", from: "other@co.com", subject: "Senior role" }),
    ];
    const classify = vi.fn().mockResolvedValue([
      makeClassify({ id: "m1", class: "recruiter_outreach", recruiterName: "HR" }),
      makeClassify({ id: "m2", class: "recruiter_outreach", roleTitle: "Senior Engineer" }),
    ]);

    const { newOutreach, result } = await runRecruiterRadar(candidates, classify as any);

    // m1 is already seen — should not appear
    expect(newOutreach).toHaveLength(1);
    expect(newOutreach[0].id).toBe("m2");
    // result.outreach still includes all (the orchestrator's newOutreach is the filtered set)
    expect(result.outreach).toHaveLength(2);

    // All candidates now marked seen
    const seen = await getSeenIds();
    expect(seen.has("m1")).toBe(true);
    expect(seen.has("m2")).toBe(true);

    // lastCheckAt updated
    const lastCheck = await getLastCheckAt();
    expect(lastCheck).toBeGreaterThan(1000);
  });

  it("explicit window returns all outreach including already-seen", async () => {
    await markSeen(["m1"], 1000);

    const candidates: Candidate[] = [
      makeCandidate({ id: "m1", from: "hr@co.com", subject: "Job opening" }),
      makeCandidate({ id: "m2", from: "other@co.com", subject: "Senior role" }),
    ];
    const classify = vi.fn().mockResolvedValue([
      makeClassify({ id: "m1", class: "recruiter_outreach", recruiterName: "HR" }),
      makeClassify({ id: "m2", class: "recruiter_outreach", roleTitle: "Senior Engineer" }),
    ]);

    const { newOutreach, result, since } = await runRecruiterRadar(candidates, classify as any, { windowDays: 7 });

    // m1 is seen but explicit window includes it anyway
    expect(newOutreach).toHaveLength(2);
    expect(newOutreach[0].id).toBe("m1");
    expect(newOutreach[1].id).toBe("m2");
    expect(result.outreach).toHaveLength(2);

    // since should be ~7 days ago
    const approx7Days = 7 * 86400000;
    expect(Math.abs(Date.now() - since - approx7Days)).toBeLessThan(5000);

    // Seen state still upserted afterward
    const seen = await getSeenIds();
    expect(seen.has("m1")).toBe(true);
    expect(seen.has("m2")).toBe(true);

    // lastCheckAt updated
    const lastCheck = await getLastCheckAt();
    expect(lastCheck).toBeGreaterThan(1000);
  });

  it("cold-start bare ask uses 7-day window when no state exists", async () => {
    const candidates: Candidate[] = [
      makeCandidate({ id: "m1", from: "hr@co.com", subject: "Job opening" }),
    ];
    const classify = vi.fn().mockResolvedValue([
      makeClassify({ id: "m1", class: "recruiter_outreach" }),
    ]);

    const { since, result } = await runRecruiterRadar(candidates, classify as any);

    // since should be ~7 days ago (COLD_START_DAYS)
    const approx7Days = 7 * 86400000;
    expect(Math.abs(Date.now() - since - approx7Days)).toBeLessThan(5000);

    // Result still processed normally
    expect(result.outreach).toHaveLength(1);
    expect(result.degraded).toBe(false);
  });
});
