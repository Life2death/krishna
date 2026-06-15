import { describe, it, expect } from "vitest";
import { parseRememberCommand, buildMemoryPrompt } from "@/lib/memory";
import type { Memory } from "@/types";

describe("parseRememberCommand", () => {
  // Legacy form (still works via form 1)
  it("parses 'remember that my X is Y'", () => {
    const result = parseRememberCommand("remember that my work folder is D:\\Projects");
    expect(result).not.toBeNull();
    expect(result!.key).toBe("work folder");
    expect(result!.value).toBe("D:\\Projects");
  });

  it("parses 'remember that X is Y' (without 'my')", () => {
    const result = parseRememberCommand("remember that password is hunter2");
    expect(result).not.toBeNull();
    expect(result!.key).toBe("password");
    expect(result!.value).toBe("hunter2");
  });

  // Form 1: verb-led is/=/: separator
  it("parses 'save my X is Y'", () => {
    const result = parseRememberCommand("save my jobs url is https://job-hunter-x5l1.onrender.com/");
    expect(result).not.toBeNull();
    expect(result!.key).toBe("jobs url");
    expect(result!.value).toBe("https://job-hunter-x5l1.onrender.com/");
  });

  it("parses 'remember X = Y' with equals", () => {
    const result = parseRememberCommand("remember jobs = https://example.com");
    expect(result).not.toBeNull();
    expect(result!.key).toBe("jobs");
    expect(result!.value).toBe("https://example.com");
  });

  it("parses 'note my X is Y'", () => {
    const result = parseRememberCommand("note my phone number is 555-1234");
    expect(result).not.toBeNull();
    expect(result!.key).toBe("phone number");
    expect(result!.value).toBe("555-1234");
  });

  it("parses 'store that my X is Y'", () => {
    const result = parseRememberCommand("store that my password is hunter2");
    expect(result).not.toBeNull();
    expect(result!.key).toBe("password");
    expect(result!.value).toBe("hunter2");
  });

  it("strips leading 'this' noise from key in form 1", () => {
    const result = parseRememberCommand("save this is my password");
    expect(result).not.toBeNull();
    // "this" is stripped from key, leaving null
    expect(result!.key).toBeNull();
    expect(result!.value).toBe("my password");
  });

  it("strips leading 'that' noise from key in form 1", () => {
    const result = parseRememberCommand("remember that this is my password");
    expect(result).not.toBeNull();
    expect(result!.key).toBeNull();
    expect(result!.value).toBe("my password");
  });

  // Form 2: "as" form
  it("parses 'save X as Y' with as form", () => {
    const result = parseRememberCommand("save https://example.com as jobs");
    expect(result).not.toBeNull();
    expect(result!.key).toBe("jobs");
    expect(result!.value).toBe("https://example.com");
  });

  it("parses 'remember this X as Y'", () => {
    const result = parseRememberCommand("remember this color as blue");
    expect(result).not.toBeNull();
    expect(result!.key).toBe("blue");
    expect(result!.value).toBe("color");
  });

  it("parses 'note that X as Y'", () => {
    const result = parseRememberCommand("note that url as homepage");
    expect(result).not.toBeNull();
    expect(result!.key).toBe("homepage");
    expect(result!.value).toBe("url");
  });

  // Return null cases
  it("returns null for non-remember command", () => {
    expect(parseRememberCommand("open Chrome")).toBeNull();
  });

  it("returns null for empty command", () => {
    expect(parseRememberCommand("")).toBeNull();
  });

  it("returns null for malformed remember command", () => {
    expect(parseRememberCommand("remember that")).toBeNull();
  });

  it("returns null when value is empty", () => {
    expect(parseRememberCommand("remember my key is")).toBeNull();
  });

  it("returns null when key after 'as' contains a URL (defer to LLM)", () => {
    const result = parseRememberCommand("save this url as jobs https://job-hunter-x5l1.onrender.com/");
    expect(result).toBeNull();
  });
});

describe("buildMemoryPrompt", () => {
  const base = "You are Krishna, an AI assistant.";

  it("returns base unchanged when no memories", () => {
    const result = buildMemoryPrompt(base, []);
    expect(result).toBe(base);
  });

  it("includes key: value formatting when key is present", () => {
    const memories: Memory[] = [
      { id: "1", key: "work folder", value: "D:\\Projects", source: "explicit", confirmed: 1, createdAt: 1, lastUsedAt: null },
    ];
    const result = buildMemoryPrompt(base, memories);
    expect(result).toContain("work folder: D:\\Projects");
    expect(result).toContain("Things I know about the user");
  });

  it("includes plain value when key is null", () => {
    const memories: Memory[] = [
      { id: "2", key: null, value: "I like cats", source: "explicit", confirmed: 1, createdAt: 2, lastUsedAt: null },
    ];
    const result = buildMemoryPrompt(base, memories);
    expect(result).toContain("I like cats");
    expect(result).not.toContain("null:");
  });

  it("skips unconfirmed memories", () => {
    const memories: Memory[] = [
      { id: "3", key: "secret", value: "hunter2", source: "extracted", confirmed: 0, createdAt: 3, lastUsedAt: null },
    ];
    const result = buildMemoryPrompt(base, memories);
    expect(result).toBe(base);
  });
});
