import { describe, it, expect } from "vitest";
import { parseRememberCommand, buildMemoryPrompt } from "@/lib/memory";
import type { Memory } from "@/types";

describe("parseRememberCommand", () => {
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

  it("returns null for non-remember command", () => {
    expect(parseRememberCommand("open Chrome")).toBeNull();
  });

  it("returns null for empty command", () => {
    expect(parseRememberCommand("")).toBeNull();
  });

  it("returns null for malformed remember command", () => {
    expect(parseRememberCommand("remember that")).toBeNull();
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
