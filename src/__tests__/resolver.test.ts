import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveTarget, needsConfirmation } from "@/lib/resolver";

// Mock invoke from the setup (defined in setup.ts)
import { invoke } from "@tauri-apps/api/core";

describe("resolveTarget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not found for empty input", async () => {
    const result = await resolveTarget("  ");
    expect(result.found).toBe(false);
  });

  it("returns not found for null input", async () => {
    const result = await resolveTarget("");
    expect(result.found).toBe(false);
  });

  it("checks learned actions first via injected lookup", async () => {
    const mockLookup = vi.fn().mockResolvedValue({
      id: "1",
      displayName: "Firefox",
      target: "C:\\Program Files\\Firefox\\firefox.exe",
      input: "firefox",
      resolvedVia: "learned",
      confidence: 0.95,
      createdAt: 1000,
    });

    const result = await resolveTarget("firefox", undefined, mockLookup);
    expect(result.found).toBe(true);
    expect(result.displayName).toBe("Firefox");
    expect(result.resolvedVia).toBe("learned");
    expect(result.confidence).toBe(0.95);
    expect(mockLookup).toHaveBeenCalledWith("firefox");
  });

  it("checks static aliases when learned returns null", async () => {
    const mockLookup = vi.fn().mockResolvedValue(null);
    const result = await resolveTarget("notepad", undefined, mockLookup);
    expect(result.found).toBe(true);
    expect(result.displayName).toBe("Notepad");
    expect(result.resolvedVia).toBe("alias");
    expect(result.confidence).toBe(1.0);
  });

  it("checks static alias case-insensitively", async () => {
    const mockLookup = vi.fn().mockResolvedValue(null);
    const result = await resolveTarget("CHROME", undefined, mockLookup);
    expect(result.found).toBe(true);
    expect(result.displayName).toBe("Chrome");
    expect(result.resolvedVia).toBe("alias");
  });

  it("calls Rust resolver when alias doesn't match", async () => {
    const mockLookup = vi.fn().mockResolvedValue(null);
    (invoke as any).mockResolvedValue({
      display_name: "Firefox",
      target: "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
      resolved_via: "start_menu",
      confidence: 0.85,
    });

    const result = await resolveTarget("mozilla firefox", undefined, mockLookup);
    expect(result.found).toBe(true);
    expect(result.displayName).toBe("Firefox");
    expect(result.target).toContain("firefox.exe");
    expect(result.resolvedVia).toBe("start_menu");
  });

  it("falls back to LLM when Rust resolver fails", async () => {
    const mockLookup = vi.fn().mockResolvedValue(null);
    (invoke as any)
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce(true);

    const llmFn = vi.fn().mockResolvedValue("steam.exe");
    const result = await resolveTarget("steam", llmFn, mockLookup);

    expect(result.found).toBe(true);
    expect(result.displayName).toBe("steam");
    expect(result.resolvedVia).toBe("llm");
    expect(result.target).toBe("steam.exe");
    expect(llmFn).toHaveBeenCalledWith("steam");
  });

  it("returns not found when nothing works", async () => {
    const mockLookup = vi.fn().mockResolvedValue(null);
    (invoke as any).mockRejectedValue(new Error("not found"));

    const result = await resolveTarget("xyznonexistentapp", undefined, mockLookup);
    expect(result.found).toBe(false);
  });
});

describe("needsConfirmation", () => {
  it("returns false for learned actions", () => {
    expect(needsConfirmation({
      found: true,
      resolvedVia: "learned",
      confidence: 0.95,
    } as any)).toBe(false);
  });

  it("returns false for alias matches", () => {
    expect(needsConfirmation({
      found: true,
      resolvedVia: "alias",
      confidence: 1.0,
    } as any)).toBe(false);
  });

  it("returns false for high-confidence registry matches (>0.7)", () => {
    expect(needsConfirmation({
      found: true,
      resolvedVia: "registry",
      confidence: 0.85,
    } as any)).toBe(false);
  });

  it("returns true for low-confidence matches (<0.7)", () => {
    expect(needsConfirmation({
      found: true,
      resolvedVia: "path",
      confidence: 0.5,
    } as any)).toBe(true);
  });

  it("returns true for LLM fallback matches", () => {
    expect(needsConfirmation({
      found: true,
      resolvedVia: "llm",
      confidence: 0.4,
    } as any)).toBe(true);
  });
});
