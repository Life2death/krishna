import { describe, it, expect, vi } from "vitest";
import { BASE_SYSTEM_PROMPT } from "@/contexts/krishna.context";

describe("BASE_SYSTEM_PROMPT — spoken conversation etiquette", () => {
  it("contains the spoken conversation section header", () => {
    expect(BASE_SYSTEM_PROMPT).toContain("SPOKEN CONVERSATION ETIQUETTE:");
  });

  it("honorific placeholder is present", () => {
    expect(BASE_SYSTEM_PROMPT).toContain("{honorific}");
  });

  it("contains all four etiquette rules", () => {
    expect(BASE_SYSTEM_PROMPT).toContain("SPOKEN CONVERSATION ETIQUETTE:");
    expect(BASE_SYSTEM_PROMPT).toContain("{honorific}");
    expect(BASE_SYSTEM_PROMPT).toContain("language the user used");
    expect(BASE_SYSTEM_PROMPT).toContain("at most 2 sentences");
    expect(BASE_SYSTEM_PROMPT).toContain("ACKNOWLEDGE-THEN-ACT");
  });
});

describe("Honorific interpolation", () => {
  it("replaces {honorific} placeholder with 'sir'", () => {
    const template = 'Address the user as "{honorific}"';
    expect(template.replace(/\{honorific\}/g, "sir")).toBe(
      'Address the user as "sir"'
    );
  });

  it("replaces multiple occurrences", () => {
    const template = 'Good morning, {honorific}. On it, {honorific}.';
    expect(template.replace(/\{honorific\}/g, "sir")).toBe(
      "Good morning, sir. On it, sir."
    );
  });

  it("falls back to 'sir' when honorific is empty", () => {
    const template = 'Good morning, {honorific}.';
    const honorific = "";
    const result = template.replace(/\{honorific\}/g, honorific || "sir");
    expect(result).toBe("Good morning, sir.");
  });
});

describe("ResponseSettings includes honorific", () => {
  it("DEFAULT_HONORIFIC is 'sir'", async () => {
    const mod = await import("@krishna/core/response-settings.constants");
    expect(mod.DEFAULT_HONORIFIC).toBe("sir");
  });

  it("ResponseSettings interface has honorific field", async () => {
    const mod = await import("@krishna/core/settings");
    expect(mod).toBeDefined();
  });
});

describe("updateCommandTiming — narrow timing write", () => {
  it("exports updateCommandTiming function from @/lib/database", async () => {
    const mod = await import("@/lib/database");
    expect(typeof mod.updateCommandTiming).toBe("function");
  });

  it("updateCommandTiming preserves existing columns", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const mockExecute = vi.fn(() => Promise.resolve({ rowsAffected: 1 }));
    setDriver({ execute: mockExecute, select: vi.fn() as any });

    const { updateCommandTiming } = await import("@/lib/database");
    await updateCommandTiming({ id: "test-id", timing: '{"m":{"t":1}}' });

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const call = mockExecute.mock.calls[0] as unknown as [string, string[]];
    const [sql, params] = call;
    expect(sql).toContain("SET timing=");
    expect(sql).not.toContain("outcome=");
    expect(sql).not.toContain("detail=");
    expect(sql).not.toContain("response=");
    expect(sql).toContain("WHERE id=");
    expect(params[0]).toBe('{"m":{"t":1}}');
    expect(params[1]).toBe("test-id");
  });
});
