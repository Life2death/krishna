import { describe, it, expect } from "vitest";
import { containsSecrets, redactText } from "@krishna/core";

describe("containsSecrets", () => {
  it("detects an API key in text", () => {
    expect(containsSecrets("my api_key=sk-abcdefghijklmnopqrstuvwxyz123456")).toBe(true);
  });

  it("returns false for benign text", () => {
    expect(containsSecrets("hello world this is fine")).toBe(false);
  });

  it("is not flaky when called twice on the same input", () => {
    const secret = "my token is sk-ant-aaaaaaaaaabbbbbbbbbbcccccccccc";
    expect(containsSecrets(secret)).toBe(true);
    expect(containsSecrets(secret)).toBe(true);
  });

  it("is not flaky on benign text called twice", () => {
    const clean = "what is the weather today";
    expect(containsSecrets(clean)).toBe(false);
    expect(containsSecrets(clean)).toBe(false);
  });

  it("is not flaky on mixed content repeated", () => {
    const mixed = "email me at test@example.com";
    expect(containsSecrets(mixed)).toBe(true);
    expect(containsSecrets(mixed)).toBe(true);
  });
});

describe("redactText", () => {
  it("redacts an OpenAI-style key", () => {
    const result = redactText("my key is sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(result.text).toContain("[REDACTED_API_KEY]");
    expect(result.redacted).toContain("openai-key");
  });

  it("redacts an email address", () => {
    const result = redactText("contact me at user@example.com");
    expect(result.text).toContain("[REDACTED_EMAIL]");
    expect(result.redacted).toContain("email");
  });

  it("returns original text when nothing to redact", () => {
    const result = redactText("hello world");
    expect(result.text).toBe("hello world");
    expect(result.redacted).toEqual([]);
  });
});
