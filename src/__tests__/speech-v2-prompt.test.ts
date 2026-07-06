import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SqlDriver } from "@krishna/core/database/driver";
import { BASE_SYSTEM_PROMPT } from "@/contexts/krishna.context";

describe("V2 — prompt variety rules", () => {
  it("ACKNOWLEDGE-THEN-ACT has 4+ style examples", () => {
    const match = BASE_SYSTEM_PROMPT.match(/• ".*"/g);
    expect(match).not.toBeNull();
    expect(match!.length).toBeGreaterThanOrEqual(4);
  });

  it("contains anti-repeat instruction for acknowledgment", () => {
    expect(BASE_SYSTEM_PROMPT).toContain("never reuse your previous acknowledgment");
    expect(BASE_SYSTEM_PROMPT).toMatch(/vary your phrase/i);
  });

  it("contains 'Style examples' header", () => {
    expect(BASE_SYSTEM_PROMPT).toContain("Style examples");
  });

  it("original etiquette rules still present", () => {
    expect(BASE_SYSTEM_PROMPT).toContain("SPOKEN CONVERSATION ETIQUETTE:");
    expect(BASE_SYSTEM_PROMPT).toContain("at most 2 sentences");
  });
});

describe("V2 — seed-personas default prompt variety", () => {
  it("default persona source text includes style examples", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("src/lib/seed-personas.ts", "utf-8");
    const exampleCount = (content.match(/• "/g) || []).length;
    expect(exampleCount).toBeGreaterThanOrEqual(5);
    expect(content).toContain("never reuse your previous acknowledgment");
  });
});

function makeMockDriver(rows: Record<string, any[]>): SqlDriver {
  return {
    select: <T>(sql: string, _params?: unknown[]) => {
      for (const [key, data] of Object.entries(rows)) {
        if (sql.includes(key)) return Promise.resolve(data as T);
      }
      return Promise.resolve([] as T);
    },
    execute: () => Promise.resolve({ rowsAffected: 0 }),
  };
}

describe("V2 — last-acks context injection", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("injects ack-repeat note when recent speech has ack entries", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const driver = makeMockDriver({
      speech_log: [
        { id: "1", text: "On it, sir.", source: "filler", related_command_id: null, created_at: 100 },
        { id: "2", text: "Got it.", source: "canned", related_command_id: null, created_at: 200 },
        { id: "3", text: "Let me check.", source: "filler", related_command_id: null, created_at: 300 },
      ],
    });
    setDriver(driver);

    const { getRecentSpeech } = await import("@krishna/core/database");
    const entries = await getRecentSpeech();

    const ackSources = new Set(["filler", "canned", "ack"]);
    const lastAcks = entries
      .filter(s => ackSources.has(s.source))
      .slice(0, 3)
      .map(s => `"${s.text}"`)
      .join(", ");

    expect(lastAcks).toBeTruthy();
    expect(lastAcks).toContain("On it, sir.");
    expect(lastAcks).toContain("Got it.");

    const ackRepeatNote = `\n\nYour last acknowledgments were: ${lastAcks} — phrase this one differently.`;
    expect(ackRepeatNote).toContain("last acknowledgments were");
    expect(ackRepeatNote).toContain("phrase this one differently");
  });

  it("skips ack-repeat note when no recent ack entries exist", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const driver = makeMockDriver({
      speech_log: [
        { id: "1", text: "The weather is nice", source: "answer", related_command_id: null, created_at: 100 },
      ],
    });
    setDriver(driver);

    const { getRecentSpeech } = await import("@krishna/core/database");
    const entries = await getRecentSpeech();

    const ackSources = new Set(["filler", "canned", "ack"]);
    const lastAcks = entries
      .filter(s => ackSources.has(s.source))
      .slice(0, 3)
      .map(s => `"${s.text}"`)
      .join(", ");

    expect(lastAcks).toBe("");
  });
});
