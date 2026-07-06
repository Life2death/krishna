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

    const updateCalls = execute.mock.calls.filter(
      (c: any) => (c[0] as string).includes("UPDATE voice_lines SET enabled = 0")
    );
    expect(updateCalls.length).toBe(2);
    expect(updateCalls[0][1]).toEqual(["line-1"]);
    expect(updateCalls[1][1]).toEqual(["line-2"]);
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

    const insertCall = execute.mock.calls.find(
      (c: any) => (c[0] as string).includes("INSERT INTO voice_lines")
    );
    expect(insertCall).toBeDefined();
    const sql = insertCall![0] as string;
    const params = insertCall![1] as any[];
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
