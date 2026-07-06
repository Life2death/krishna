import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VoiceLineRow } from "@krishna/core/database";

function makeMockDriver(rows: Record<string, any[]>) {
  return {
    select: <T>(sql: string, _params?: unknown[]) => {
      for (const [key, data] of Object.entries(rows)) {
        if (sql.includes(key)) return Promise.resolve(data as T);
      }
      return Promise.resolve([] as T);
    },
    execute: vi.fn(() => Promise.resolve({ rowsAffected: 1 })),
  };
}

describe("V3 — speech_ban action", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("disables matching lines by text substring", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const execute = vi.fn(() => Promise.resolve({ rowsAffected: 1 }));
    const driver = {
      select: <T>(sql: string, _params?: unknown[]) => {
        if (sql.includes("WHERE text LIKE ?")) {
          return Promise.resolve([
            {
              id: "line-1", category: "filler_wait", lang: "en",
              text: "One minute, sir.", source: "seed", enabled: 1,
              weight: 1, last_used_at: null, use_count: 0,
              created_at: 100, tod: null,
            },
            {
              id: "line-2", category: "filler_wait", lang: "en",
              text: "One moment, sir.", source: "seed", enabled: 1,
              weight: 1, last_used_at: null, use_count: 0,
              created_at: 100, tod: null,
            },
          ] as T);
        }
        if (sql.includes("enabled = 0")) {
          return Promise.resolve([] as T);
        }
        if (sql.includes("voice_lines")) {
          return Promise.resolve([] as T);
        }
        return Promise.resolve([] as T);
      },
      execute,
    };
    setDriver(driver);

    const { getLinesByText, disableLine } = await import("@krishna/core/database");
    const lines = await getLinesByText("one minute");
    expect(lines.length).toBe(2);

    for (const line of lines) {
      await disableLine(line.id);
    }

    const updateCalls = (execute.mock.calls as any[][]).filter(
      (c) => (c[0] as string).includes("UPDATE voice_lines SET enabled = 0")
    );
    expect(updateCalls.length).toBe(2);
    expect((updateCalls[0] as any[])[1]).toEqual(["line-1"]);
    expect((updateCalls[1] as any[])[1]).toEqual(["line-2"]);
  });

  it("returns empty when no lines match the banned phrase", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    setDriver({
      select: <T>() => Promise.resolve([] as T),
      execute: vi.fn(() => Promise.resolve({ rowsAffected: 0 })),
    });

    const { getLinesByText } = await import("@krishna/core/database");
    const lines = await getLinesByText("nonexistent phrase");
    expect(lines.length).toBe(0);
  });

  // Regression guard: a ban must stick even when the phrase never matched any seeded/taught
  // voice_lines row — the common real-world case is banning ad-hoc LLM free-form phrasing
  // (V2), not a canned line. Drives the real executeAction, not a reimplementation.
  it("executeAction(speech_ban) persists the raw phrase even with zero matching lines, and it survives into the banned-phrase list", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const bannedRows: { id: string; phrase: string; created_at: number }[] = [];
    const execute = vi.fn((sql: string, p?: unknown[]) => {
      if (sql.includes("INSERT INTO banned_phrases")) {
        const [id, phrase, created_at] = p as [string, string, number];
        bannedRows.push({ id, phrase, created_at });
        return Promise.resolve({ rowsAffected: 1 });
      }
      return Promise.resolve({ rowsAffected: 0 });
    });
    setDriver({
      select: <T>(sql: string) => {
        if (sql.includes("banned_phrases")) return Promise.resolve(bannedRows as T);
        return Promise.resolve([] as T); // no matching voice_lines
      },
      execute,
    });

    const { executeAction } = await import("@/lib/actions");
    const result = await executeAction({ action: "speech_ban", phrase: "one minute sir" });

    expect(bannedRows.some(r => r.phrase === "one minute sir")).toBe(true);
    expect(result.spokenResponse).not.toMatch(/^No existing phrases match/);
    expect(result.spokenResponse?.toLowerCase()).toContain("one minute sir");

    const { getBannedPhrases } = await import("@krishna/core/database");
    const stillBanned = await getBannedPhrases();
    expect(stillBanned).toContain("one minute sir");
  });

  it("banPhrase is idempotent (case-insensitive dedup)", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const bannedRows: { id: string; phrase: string; created_at: number }[] = [];
    setDriver({
      select: <T>(sql: string, p?: unknown[]) => {
        if (sql.includes("lower(phrase) = lower(?)")) {
          const [phrase] = p as [string];
          return Promise.resolve(
            bannedRows.filter(r => r.phrase.toLowerCase() === phrase.toLowerCase()) as T
          );
        }
        if (sql.includes("SELECT phrase FROM banned_phrases")) {
          return Promise.resolve(bannedRows as T);
        }
        return Promise.resolve([] as T);
      },
      execute: vi.fn((sql: string, p?: unknown[]) => {
        if (sql.includes("INSERT INTO banned_phrases")) {
          const [id, phrase, created_at] = p as [string, string, number];
          bannedRows.push({ id, phrase, created_at });
        }
        return Promise.resolve({ rowsAffected: 1 });
      }),
    });

    const { banPhrase, getBannedPhrases } = await import("@krishna/core/database");
    await banPhrase("One Minute Sir");
    await banPhrase("one minute sir");
    const all = await getBannedPhrases();
    expect(all.length).toBe(1);
  });
});

describe("V3 — speech_teach action", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("inserts a new owner line with higher weight", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const execute = vi.fn(() => Promise.resolve({ rowsAffected: 1 }));
    const driver = {
      select: <T>(sql: string, _params?: unknown[]) => {
        if (sql.includes("WHERE category = ?")) {
          return Promise.resolve([] as T);
        }
        return Promise.resolve([] as T);
      },
      execute,
    };
    setDriver(driver);

    const { insertLine } = await import("@krishna/core/database");
    await insertLine({
      id: "new-id",
      category: "filler_wait",
      lang: "en",
      text: "Ek minute, boss.",
      source: "owner",
      enabled: 1,
      weight: 1.5,
      lastUsedAt: null,
      useCount: 0,
      createdAt: Date.now(),
      tod: null,
    });

    const insertCall = (execute.mock.calls as any[][]).find(
      (c) => (c[0] as string).includes("INSERT INTO voice_lines")
    );
    expect(insertCall).toBeDefined();
    const call = insertCall as any[];
    const sql = call[0] as string;
    const params = call[1] as any[];
    expect(sql).toContain("INSERT INTO voice_lines");
    expect(params).toContain("Ek minute, boss.");
    expect(params).toContain("owner");
    expect(params).toContain(1.5);
  });

  it("skips insertion when duplicate exists", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const execute = vi.fn(() => Promise.resolve({ rowsAffected: 1 }));
    const driver = {
      select: <T>(sql: string, _params?: unknown[]) => {
        if (sql.includes("WHERE category = ?")) {
          return Promise.resolve([
            {
              id: "existing", category: "greeting", lang: "en",
              text: "Good morning, sir!", source: "seed", enabled: 1,
              weight: 1, last_used_at: null, use_count: 0,
              created_at: 100, tod: "morning",
            },
          ] as T);
        }
        return Promise.resolve([] as T);
      },
      execute,
    };
    setDriver(driver);

    const { getAllLinesByCategory } = await import("@krishna/core/database");
    const existing = await getAllLinesByCategory("greeting" as any);
    const dup = existing.find(
      (l: VoiceLineRow) => l.text.toLowerCase() === "good morning, sir!".toLowerCase()
    );
    expect(dup).toBeDefined();
  });
});

describe("V3 — banned phrases prompt injection", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("injects banned phrases note when disabled lines exist", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    setDriver({
      select: <T>(sql: string, _params?: unknown[]) => {
        if (sql.includes("enabled = 0")) {
          return Promise.resolve([
            {
              id: "d1", category: "filler_wait", lang: "en",
              text: "One minute, sir.", source: "seed", enabled: 0,
              weight: 1, last_used_at: null, use_count: 0,
              created_at: 100, tod: null,
            },
          ] as T);
        }
        return Promise.resolve([] as T);
      },
      execute: vi.fn(() => Promise.resolve({ rowsAffected: 0 })),
    });

    const { getDisabledLines } = await import("@krishna/core/database");
    const disabled = await getDisabledLines();
    expect(disabled.length).toBe(1);

    const bannedPhraseList = disabled.map(l => `"${l.text}"`).join(", ");
    const bannedNote = `\n\nBanned phrases the user has asked you to avoid: ${bannedPhraseList}. Do not use these exact phrases.`;
    expect(bannedNote).toContain("One minute, sir.");
    expect(bannedNote).toContain("Banned phrases");
  });

  it("skips banned phrases note when no disabled lines", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    setDriver({
      select: <T>() => Promise.resolve([] as T),
      execute: vi.fn(() => Promise.resolve({ rowsAffected: 0 })),
    });

    const { getDisabledLines } = await import("@krishna/core/database");
    const disabled = await getDisabledLines();
    expect(disabled.length).toBe(0);
  });
});

describe("V4 — speech_accept_vocabulary action", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // Regression guard: Krishna's spoken reply after a vocabulary refresh promises "say
  // 'accept them'" — that promise must actually do something, not be a dead end.
  it("executeAction(speech_accept_vocabulary) enables all pending llm-sourced lines and reports the count", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const execute = vi.fn((sql: string) => {
      if (sql.includes("UPDATE voice_lines SET enabled = 1 WHERE enabled = 0 AND source = 'llm'")) {
        return Promise.resolve({ rowsAffected: 3 });
      }
      return Promise.resolve({ rowsAffected: 0 });
    });
    setDriver({ select: <T>() => Promise.resolve([] as T), execute });

    const { executeAction } = await import("@/lib/actions");
    const result = await executeAction({ action: "speech_accept_vocabulary" });

    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE voice_lines SET enabled = 1 WHERE enabled = 0 AND source = 'llm'")
    );
    expect(result.spokenResponse).toContain("3");
  });

  it("reports nothing-pending when zero llm lines are disabled", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    setDriver({
      select: <T>() => Promise.resolve([] as T),
      execute: vi.fn(() => Promise.resolve({ rowsAffected: 0 })),
    });

    const { executeAction } = await import("@/lib/actions");
    const result = await executeAction({ action: "speech_accept_vocabulary" });
    expect(result.spokenResponse?.toLowerCase()).toContain("nothing pending");
  });
});
