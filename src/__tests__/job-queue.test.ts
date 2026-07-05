// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSecret = vi.hoisted(() => vi.fn());
const mockHttpFetch = vi.hoisted(() => vi.fn());

vi.mock("@krishna/core/secrets", () => ({
  getSecret: mockGetSecret,
  setSecretGetter: vi.fn(),
}));

vi.mock("@krishna/core/http", () => ({
  getHttpFetch: () => mockHttpFetch,
  setHttpFetch: vi.fn(),
}));

import { getJobQueueTool } from "@krishna/core/tools/job-queue";

function makeJob(overrides: Record<string, any> = {}) {
  return {
    job_id: "123",
    title: "Senior Engineer",
    company: "Acme Corp",
    fit: 85,
    location: "Mumbai",
    status: "not_applied",
    created_at: "2026-07-04T10:00:00Z",
    ...overrides,
  };
}

function mockFetchResponse(data: any, status = 200) {
  mockHttpFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
}

function mockFetchError(status: number, body = "") {
  mockHttpFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => body,
  });
}

function mockNetworkError() {
  mockHttpFetch.mockRejectedValueOnce(new Error("Failed to fetch"));
}

describe("getJobQueueTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns formatted summary with count and top jobs", async () => {
    mockGetSecret.mockResolvedValue("test-token-123");
    mockFetchResponse({
      rows: [
        makeJob({ job_id: "1", title: "Senior Engineer", company: "Acme Corp", fit: 92 }),
        makeJob({ job_id: "2", title: "Product Manager", company: "Beta Inc", fit: 78 }),
        makeJob({ job_id: "3", title: "Data Analyst", company: "Gamma LLC", fit: 65 }),
      ],
      total: 3,
    });

    const result = await getJobQueueTool.run({}, { vars: {} });

    expect(result.success).toBe(true);
    expect(result.output).toContain("3 unapplied jobs");
    expect(result.output).toContain("Senior Engineer at Acme Corp");
    expect(result.output).toContain("Product Manager at Beta Inc");
    expect(result.data?.count).toBe("3");
  });

  it("sorts by fit descending", async () => {
    mockGetSecret.mockResolvedValue("test-token-123");
    mockFetchResponse({
      rows: [
        makeJob({ job_id: "1", title: "Low Fit", company: "A", fit: 30 }),
        makeJob({ job_id: "2", title: "High Fit", company: "B", fit: 95 }),
        makeJob({ job_id: "3", title: "Mid Fit", company: "C", fit: 60 }),
      ],
      total: 3,
    });

    const result = await getJobQueueTool.run({}, { vars: {} });

    expect(result.success).toBe(true);
    expect(result.output!.indexOf("High Fit")).toBeLessThan(result.output!.indexOf("Mid Fit"));
    expect(result.output!.indexOf("Mid Fit")).toBeLessThan(result.output!.indexOf("Low Fit"));
  });

  it("returns error when no token is configured", async () => {
    mockGetSecret.mockResolvedValue(null);

    const result = await getJobQueueTool.run({}, { vars: {} });

    expect(result.success).toBe(false);
    expect(result.output).toContain("token is not configured");
    expect(result.error).toContain("JOB_HUNTER_API_TOKEN not found");
  });

  it("returns error on 401", async () => {
    mockGetSecret.mockResolvedValue("invalid-token");
    mockFetchError(401);

    const result = await getJobQueueTool.run({}, { vars: {} });

    expect(result.success).toBe(false);
    expect(result.output).toContain("token seems to be invalid");
    expect(result.error).toContain("401");
  });

  it("returns error on network failure", async () => {
    mockGetSecret.mockResolvedValue("test-token-123");
    mockNetworkError();

    const result = await getJobQueueTool.run({}, { vars: {} });

    expect(result.success).toBe(false);
    expect(result.output).toContain("couldn't reach");
    expect(result.error).toContain("Network error");
  });

  it("returns empty message when queue has no rows", async () => {
    mockGetSecret.mockResolvedValue("test-token-123");
    mockFetchResponse({ rows: [], total: 0 });

    const result = await getJobQueueTool.run({}, { vars: {} });

    expect(result.success).toBe(true);
    expect(result.output).toContain("empty");
    expect(result.data?.count).toBe("0");
  });

  it("includes 'N added today' when jobs have today's date", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mockGetSecret.mockResolvedValue("test-token-123");
    mockFetchResponse({
      rows: [
        makeJob({ job_id: "1", title: "New Job", company: "Fresh Co", fit: 80, created_at: `${today}T10:00:00Z` }),
        makeJob({ job_id: "2", title: "Old Job", company: "Stale Inc", fit: 70, created_at: "2026-06-01T10:00:00Z" }),
      ],
      total: 2,
    });

    const result = await getJobQueueTool.run({}, { vars: {} });

    expect(result.success).toBe(true);
    expect(result.output).toContain("1 added today");
  });

  it("sends Authorization header with Bearer token", async () => {
    mockGetSecret.mockResolvedValue("secret-token");
    mockFetchResponse({ rows: [], total: 0 });

    await getJobQueueTool.run({}, { vars: {} });

    const callArgs = mockHttpFetch.mock.calls[0];
    expect(callArgs[0]).toContain("/api/jobs?status=not_applied&limit=25");
    expect(callArgs[1].headers.Authorization).toBe("Bearer secret-token");
  });
});
