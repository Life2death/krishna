import { describe, it, expect, vi } from "vitest";
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
    expect(output).toContain("priya@abc.com");
    expect(output).toContain("Delivery Head");
  });
});

describe("formatSince", () => {
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

  it('returns "this morning" for 6-23 hours ago', () => {
    const tenHoursAgo = Date.now() - 3600000 * 10;
    expect(formatSince(tenHoursAgo)).toBe("this morning");
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
