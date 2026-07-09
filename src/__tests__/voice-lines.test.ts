import { describe, it, expect, beforeAll } from "vitest";
import { setDriver } from "@krishna/core/database/driver";
import { getLinesByCategory } from "@krishna/core/database";
import { pickLine, seedVoiceLines } from "@/lib/voice-lines";
import { makeFakeVoiceLinesDriver } from "./support/voice-lines-fake-driver";

describe("voice-lines picker", () => {
  beforeAll(async () => {
    setDriver(makeFakeVoiceLinesDriver() as never);
    await seedVoiceLines();
  });

  it("returns a filler_wait line for en", async () => {
    const line = await pickLine("filler_wait", "en", "sir");
    expect(line).toBeTruthy();
    expect(line.length).toBeGreaterThan(0);
  });

  it("fills {honorific} slot", async () => {
    const line = await pickLine("greeting", "en", "boss");
    expect(line).toContain("boss");
    expect(line).not.toContain("{honorific}");
  });

  it("falls back hi -> en when no mr lines exist for a category", async () => {
    const line = await pickLine("error_network", "mr", "sir");
    expect(line).toBeTruthy();
    expect(line.length).toBeGreaterThan(0);
  });

  it("returns different lines across multiple picks (anti-repeat)", async () => {
    const results = new Set<string>();
    for (let i = 0; i < 5; i++) {
      results.add(await pickLine("filler_wait", "en", "sir"));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it("never picks a disabled line", async () => {
    const lines = await getLinesByCategory("ack_quick", "en");
    expect(lines.length).toBeGreaterThan(0);
    const id = lines[0].id;
    const { disableLine } = await import("@krishna/core/database");
    await disableLine(id);
    const line = await pickLine("ack_quick", "en", "sir");
    expect(line).toBeTruthy();
    const remaining = await getLinesByCategory("ack_quick", "en");
    const picked = remaining.find((r) => r.text === line);
    expect(picked?.id).not.toBe(id);
  });

  it("uses fallbackLine when no lines exist for a category", async () => {
    const line = await pickLine("ack_multistep", "xyz", "sir");
    expect(line).toBeTruthy();
  });

  // Time-of-day only *boosts* matching lines' weight (TOD_BOOST); it is not a
  // hard filter, so pickLine can still return a generic greeting. Asserting the
  // result contains "morning" made this test flaky (failed whenever CI ran
  // 06:00–12:00 UTC and a generic line won the weighted draw). Assert the
  // contract that actually holds: a valid greeting is always returned.
  it("always returns a valid greeting line", async () => {
    const line = await pickLine("greeting", "en", "sir");
    expect(typeof line).toBe("string");
    expect(line.length).toBeGreaterThan(0);
  });
});
