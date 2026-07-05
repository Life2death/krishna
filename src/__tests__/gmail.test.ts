import { describe, it, expect, vi, beforeEach } from "vitest";
import { sanitizeEmailField, isValidEmail, formatSearchOutput, extractSenderName, normalizeSubject, gmailSearchMessagesTool, gmailSendEmailTool, gmailFetchRecruiterCandidates } from "@krishna/core/tools/gmail";
import type { SearchResult } from "@krishna/core/tools/gmail";
import { setSecretGetter } from "@krishna/core/secrets";
import { setHttpFetch, getHttpFetch } from "@krishna/core/http";
import { setVerbatimConfirm } from "@krishna/core/tools/mcp-bridge";

describe("sanitizeEmailField", () => {
  it("strips embedded CRLF from to field", () => {
    expect(sanitizeEmailField("victim@test.com\r\nBcc: attacker@evil.com")).toBe("victim@test.comBcc: attacker@evil.com");
  });

  it("strips embedded LF from subject field", () => {
    expect(sanitizeEmailField("Meeting\nSubject: injected")).toBe("MeetingSubject: injected");
  });

  it("strips mixed CR and LF", () => {
    expect(sanitizeEmailField("a\r\nb\nc")).toBe("abc");
  });

  it("trims whitespace", () => {
    expect(sanitizeEmailField("  hello@test.com  ")).toBe("hello@test.com");
  });

  it("passes through clean values unchanged", () => {
    expect(sanitizeEmailField("user@example.com")).toBe("user@example.com");
  });
});

describe("isValidEmail", () => {
  it("accepts standard email", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("rejects missing @", () => {
    expect(isValidEmail("userexample.com")).toBe(false);
  });

  it("rejects missing domain", () => {
    expect(isValidEmail("user@")).toBe(false);
  });

  it("rejects missing tld", () => {
    expect(isValidEmail("user@example")).toBe(false);
  });

  it("accepts email with subdomain", () => {
    expect(isValidEmail("user@sub.example.com")).toBe(true);
  });

  it("rejects spaces", () => {
    expect(isValidEmail("user @example.com")).toBe(false);
  });
});

describe("formatSearchOutput", () => {
  const results: SearchResult[] = [
    { id: "18abc123", threadId: "thread1", from: "Boss <boss@example.com>", subject: "Meeting tomorrow", date: "2026-07-04", snippet: "Let's meet" },
    { id: "19def456", threadId: "thread2", from: "hr@example.com", subject: "Holiday list", date: "2026-07-03", snippet: "Holidays" },
  ];

  it("includes count, sender name (not raw email), subject", () => {
    const output = formatSearchOutput(results, "meeting", "sir");
    expect(output).toContain("Found 2 messages");
    expect(output).toContain("Boss");
    expect(output).not.toContain("boss@example.com");
    expect(output).toContain("Meeting tomorrow");
    expect(output).toContain("sir");
  });

  it("speaks 'say read it' instead of raw message ID", () => {
    const output = formatSearchOutput(results, "meeting", "sir");
    expect(output).toContain('Say "read it"');
    expect(output).not.toContain("18abc123");
    expect(output).not.toContain("gmail_read");
  });

  it("handles empty results", () => {
    const output = formatSearchOutput([], "nothing", "sir");
    expect(output).toContain("No messages found");
    expect(output).toContain("nothing");
    expect(output).not.toContain("read it");
  });

  it("uses provided honorific", () => {
    const output = formatSearchOutput(results, "test", "madam");
    expect(output).toContain("madam");
    expect(output).not.toContain("sir");
  });

  it("works with single result and uses local-part name for bare email", () => {
    const oneResult: SearchResult[] = [
      { id: "single1", threadId: "t1", from: "a@b.com", subject: "Hello", date: "", snippet: "" },
    ];
    const output = formatSearchOutput(oneResult, "hello", "sir");
    expect(output).toContain("Found 1 message");
    expect(output).toContain("a");
    expect(output).toContain("Hello");
    expect(output).toContain('Say "read it"');
    expect(output).not.toContain("single1");
  });

  it("extracts display name from bracket-form sender", () => {
    const results: SearchResult[] = [
      { id: "x1", threadId: "t1", from: '"Vikram Panmand" <vik@example.com>', subject: "Hey", date: "", snippet: "" },
    ];
    const output = formatSearchOutput(results, "test", "sir");
    expect(output).toContain("Vikram Panmand");
    expect(output).not.toContain("vik@example.com");
  });

  it("normalizes em-dash in subject for speech", () => {
    const results: SearchResult[] = [
      { id: "x2", threadId: "t1", from: "x@y.com", subject: "Hello\u2014world", date: "", snippet: "" },
    ];
    const output = formatSearchOutput(results, "q", "sir");
    expect(output).not.toContain("\u2014");
    expect(output).toContain("Hello,world");
  });

  it("normalizes ISO date in subject for speech", () => {
    const results: SearchResult[] = [
      { id: "x3", threadId: "t1", from: "x@y.com", subject: "Report 2026-07-05", date: "", snippet: "" },
    ];
    const output = formatSearchOutput(results, "q", "sir");
    expect(output).toContain("July");
    expect(output).not.toContain("2026-07-05");
  });

  it("normalizes colons in query label for speech (no raw operators)", () => {
    const results: SearchResult[] = [
      { id: "x4", threadId: "t1", from: "a@b.com", subject: "Hi", date: "", snippet: "" },
    ];
    const output = formatSearchOutput(results, "category:primary", "sir");
    expect(output).toContain("category");
    expect(output).toContain("primary");
  });
});

function mockSecretGetter() {
  setSecretGetter(async (key: string) => {
    if (key === "GMAIL_OAUTH_TOKENS") {
      return JSON.stringify({
        access_token: "test-at",
        refresh_token: "test-rt",
        expiry_date: Date.now() + 100_000,
      });
    }
    if (key === "GMAIL_CLIENT_ID") return "test-id";
    if (key === "GMAIL_CLIENT_SECRET") return "test-secret";
    return null;
  });
}

function mockHttpOk(body: unknown) {
  setHttpFetch(vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }));
}

describe("gmailSearchMessagesTool — empty query", () => {
  beforeEach(() => {
    mockSecretGetter();
  });

  it("omits q param when query is empty and returns success", async () => {
    mockHttpOk({ messages: [] });
    const result = await gmailSearchMessagesTool.run({ query: "" }, { vars: {} });
    expect(result.success).toBe(true);
    expect(result.output).toContain("No messages found");
  });

  it("omits q param when query is undefined and returns success", async () => {
    mockHttpOk({ messages: [] });
    const result = await gmailSearchMessagesTool.run({}, { vars: {} });
    expect(result.success).toBe(true);
    expect(result.output).toContain("No messages found");
  });

  it("returns GMAIL_NOT_CONFIGURED when no tokens exist", async () => {
    setSecretGetter(async () => null);
    const result = await gmailSearchMessagesTool.run({ query: "test" }, { vars: {} });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Gmail is not connected");
  });
});

describe("gmailSendEmailTool — preConfirmed skips confirm", () => {
  beforeEach(() => {
    mockSecretGetter();
  });

  it("skips confirm when preConfirmed is true", async () => {
    const confirmSpy = vi.fn().mockResolvedValue(true);
    setVerbatimConfirm(confirmSpy);
    mockHttpOk({ id: "sent123" });

    const result = await gmailSendEmailTool.run(
      { to: "test@example.com", subject: "Hello", body: "World", cc: "", bcc: "" },
      { vars: {}, preConfirmed: true },
    );

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.output).toContain("Email sent");
  });

  it("calls confirm when preConfirmed is false", async () => {
    const confirmSpy = vi.fn().mockResolvedValue(true);
    setVerbatimConfirm(confirmSpy);
    mockHttpOk({ id: "sent456" });

    const result = await gmailSendEmailTool.run(
      { to: "test@example.com", subject: "Hello", body: "World", cc: "", bcc: "" },
      { vars: {}, preConfirmed: false },
    );

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it("returns declined when preConfirmed is false and user declines", async () => {
    const confirmSpy = vi.fn().mockResolvedValue(false);
    setVerbatimConfirm(confirmSpy);
    mockHttpOk({ id: "sent789" });

    const result = await gmailSendEmailTool.run(
      { to: "test@example.com", subject: "Hello", body: "World", cc: "", bcc: "" },
      { vars: {}, preConfirmed: false },
    );

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error).toBe("User declined");
  });
});

describe("gmailFetchRecruiterCandidates — RR-2", () => {
  beforeEach(() => {
    mockSecretGetter();
  });

  it("returns empty candidates with no prefix when primary returns 0 results", async () => {
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [] }),
    });
    setHttpFetch(mockFetch);

    const result = await gmailFetchRecruiterCandidates(0);

    expect(result.candidates).toEqual([]);
    expect(result.capHit).toBe(false);
    expect(result.inboxFallback).toBe(false);
    // Only the primary query was made — no inbox fallback
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url0 = decodeURIComponent(mockFetch.mock.calls[0][0]);
    expect(url0).toContain("category:primary");
  });

  it("falls back to in:inbox when category:primary throws", async () => {
    const mockFetch = vi.fn();
    // First call (primary) — throws
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    // Second call (inbox fallback) — empty result
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ messages: [] }),
    });
    setHttpFetch(mockFetch);

    const result = await gmailFetchRecruiterCandidates(0);

    expect(result.candidates).toEqual([]);
    expect(result.capHit).toBe(false);
    expect(result.inboxFallback).toBe(true);
    // Both primary (failed) and inbox fallback were attempted
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const url1 = decodeURIComponent(mockFetch.mock.calls[1][0]);
    expect(url1).toContain("in:inbox");
  });
});

describe("extractSenderName", () => {
  it("extracts display name from bracket form", () => {
    expect(extractSenderName('"Vikram Panmand" <vik@example.com>')).toBe("Vikram Panmand");
  });

  it("extracts display name from bracket form without quotes", () => {
    expect(extractSenderName("Vikram Panmand <vik@example.com>")).toBe("Vikram Panmand");
  });

  it("returns local-part for bare email", () => {
    expect(extractSenderName("ahr@example.com")).toBe("ahr");
  });

  it("returns 'unknown sender' for empty string", () => {
    expect(extractSenderName("")).toBe("unknown sender");
  });
});

describe("normalizeSubject", () => {
  it("replaces em-dash with comma", () => {
    expect(normalizeSubject("Hello\u2014world")).toBe("Hello,world");
  });

  it("replaces en-dash with comma", () => {
    expect(normalizeSubject("Hello\u2013world")).toBe("Hello,world");
  });

  it("converts ISO date to spoken form", () => {
    const result = normalizeSubject("Report 2026-07-05");
    expect(result).toContain("July");
    expect(result).toContain("5");
    expect(result).toContain("2026");
    expect(result).not.toContain("2026-07-05");
  });

  it("leaves plain text unchanged", () => {
    expect(normalizeSubject("Meeting tomorrow")).toBe("Meeting tomorrow");
  });
});
