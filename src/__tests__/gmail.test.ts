import { describe, it, expect } from "vitest";
import { sanitizeEmailField, isValidEmail, formatSearchOutput } from "@krishna/core/tools/gmail";
import type { SearchResult } from "@krishna/core/tools/gmail";

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
    { id: "18abc123", threadId: "thread1", from: "boss@example.com", subject: "Meeting tomorrow", date: "2026-07-04", snippet: "Let's meet" },
    { id: "19def456", threadId: "thread2", from: "hr@example.com", subject: "Holiday list", date: "2026-07-03", snippet: "Holidays" },
  ];

  it("includes count and newest message info", () => {
    const output = formatSearchOutput(results, "meeting", "sir");
    expect(output).toContain("Found 2 messages");
    expect(output).toContain("boss@example.com");
    expect(output).toContain("Meeting tomorrow");
    expect(output).toContain("sir");
  });

  it("includes the message ID for follow-up read", () => {
    const output = formatSearchOutput(results, "meeting", "sir");
    expect(output).toContain('gmail_read with id "18abc123"');
  });

  it("handles empty results", () => {
    const output = formatSearchOutput([], "nothing", "sir");
    expect(output).toContain("No messages found");
    expect(output).toContain("nothing");
    expect(output).not.toContain("gmail_read");
  });

  it("uses provided honorific", () => {
    const output = formatSearchOutput(results, "test", "madam");
    expect(output).toContain("madam");
    expect(output).not.toContain("sir");
  });

  it("works with single result", () => {
    const oneResult: SearchResult[] = [
      { id: "single1", threadId: "t1", from: "a@b.com", subject: "Hello", date: "", snippet: "" },
    ];
    const output = formatSearchOutput(oneResult, "hello", "sir");
    expect(output).toContain("Found 1 message");
    expect(output).toContain('gmail_read with id "single1"');
  });
});
