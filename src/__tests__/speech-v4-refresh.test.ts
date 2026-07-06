import { describe, it, expect, vi, beforeEach } from "vitest";

// Single fake driver handles every SQL statement vocabularyRefresh's real call chain
// issues (conversations/messages for getOwnerUtterances, voice_lines + banned_phrases for
// the quality filters) — exercises the actual functions end-to-end rather than mocking
// @krishna/core/database's module surface (vi.mock + importOriginal + vi.resetModules
// proved unreliable across multiple tests in one file: the mocked module's captured
// driver reference went stale after the first resetModules, silently breaking later
// tests' dup/insert checks).
function makeDriver(opts: {
  voiceLines?: Record<string, unknown>[];
  disabledLines?: Record<string, unknown>[];
  bannedPhrases?: string[];
  userUtterances?: string[];
} = {}) {
  const inserted: Record<string, unknown>[] = [];
  const voiceLines = opts.voiceLines ?? [];
  const disabledLines = opts.disabledLines ?? [];
  const bannedPhrases = opts.bannedPhrases ?? [];
  const userUtterances = opts.userUtterances ?? ["yaar ek kaam kar do jaldi se", "thanks boss"];

  return {
    inserted,
    driver: {
      select: <T>(sql: string, p?: unknown[]) => {
        if (sql.includes("FROM conversations")) {
          return Promise.resolve([{ id: "c1", title: "t", created_at: 0, updated_at: 0 }] as T);
        }
        if (sql.includes("FROM messages")) {
          return Promise.resolve(
            userUtterances.map((content, i) => ({
              id: `m${i}`, conversation_id: "c1", role: "user", content, timestamp: i, attached_files: null,
            })) as T
          );
        }
        if (sql.includes("SELECT phrase FROM banned_phrases")) {
          return Promise.resolve(bannedPhrases.map((phrase) => ({ phrase })) as T);
        }
        if (sql.includes("enabled = 0")) {
          return Promise.resolve(disabledLines as T);
        }
        if (sql.includes("WHERE category = ?")) {
          const [category] = p as [string];
          return Promise.resolve(
            [...voiceLines, ...inserted].filter((r) => r.category === category) as T
          );
        }
        if (sql.includes("SELECT * FROM voice_lines ORDER BY category")) {
          return Promise.resolve([...voiceLines, ...inserted] as T);
        }
        return Promise.resolve([] as T);
      },
      execute: vi.fn((sql: string, p?: unknown[]) => {
        if (sql.includes("INSERT INTO voice_lines")) {
          const cols = ["id", "category", "lang", "text", "source", "enabled", "weight", "last_used_at", "use_count", "created_at", "tod"];
          const row: Record<string, unknown> = {};
          cols.forEach((c, i) => { row[c] = (p as unknown[])[i]; });
          inserted.push(row);
          return Promise.resolve({ rowsAffected: 1 });
        }
        return Promise.resolve({ rowsAffected: 0 });
      }),
    },
  };
}

describe("V4 — vocabularyRefresh quality filters", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("inserts proposals that pass all quality checks as disabled llm-sourced lines", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const { driver, inserted } = makeDriver();
    setDriver(driver);

    const { vocabularyRefresh } = await import("@/lib/actions");
    const llmFallback = vi.fn(async () =>
      JSON.stringify({
        proposals: [
          { category: "filler_wait", text: "Ek second, {honorific}." },
          { category: "greeting", text: "Kaisa hai, {honorific}?" },
        ],
      })
    );

    const result = await vocabularyRefresh(llmFallback);
    expect(result.total).toBe(2);
    expect(inserted.every((r) => r.source === "llm" && r.enabled === 0)).toBe(true);
  });

  it("rejects a proposal that collides with a banned phrase (raw banned_phrases entry, not just a disabled voice_lines row)", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const { driver, inserted } = makeDriver({ bannedPhrases: ["one minute sir"] });
    setDriver(driver);

    const { vocabularyRefresh } = await import("@/lib/actions");
    const llmFallback = vi.fn(async () =>
      JSON.stringify({
        proposals: [{ category: "filler_wait", text: "One minute sir, please." }],
      })
    );

    const result = await vocabularyRefresh(llmFallback);
    expect(result.total).toBe(0);
    expect(inserted.length).toBe(0);
  });

  it("rejects a duplicate of an existing line in the same category", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const { driver, inserted } = makeDriver({
      voiceLines: [
        { id: "e1", category: "greeting", lang: "en", text: "hello there", source: "seed", enabled: 1, weight: 1, last_used_at: null, use_count: 0, created_at: 0, tod: null },
      ],
    });
    setDriver(driver);

    const { vocabularyRefresh } = await import("@/lib/actions");
    const llmFallback = vi.fn(async () =>
      JSON.stringify({ proposals: [{ category: "greeting", text: "Hello There" }] })
    );

    const result = await vocabularyRefresh(llmFallback);
    expect(result.total).toBe(0);
    expect(inserted.length).toBe(0);
  });

  it("rejects a phrase that hardcodes a literal honorific word instead of the {honorific} slot", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const { driver, inserted } = makeDriver();
    setDriver(driver);

    const { vocabularyRefresh } = await import("@/lib/actions");
    const llmFallback = vi.fn(async () =>
      JSON.stringify({ proposals: [{ category: "ack_quick", text: "Right away, sir." }] })
    );

    const result = await vocabularyRefresh(llmFallback);
    expect(result.total).toBe(0);
    expect(inserted.length).toBe(0);
  });

  it("accepts a phrase with no honorific reference at all (honorific-less lines are legitimate, matching V1 seed variety)", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const { driver, inserted } = makeDriver();
    setDriver(driver);

    const { vocabularyRefresh } = await import("@/lib/actions");
    const llmFallback = vi.fn(async () =>
      JSON.stringify({ proposals: [{ category: "ack_quick", text: "Right away, on it now." }] })
    );

    const result = await vocabularyRefresh(llmFallback);
    expect(result.total).toBe(1);
    expect(inserted.length).toBe(1);
  });

  it("accepts a phrase that correctly uses the {honorific} slot", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const { driver, inserted } = makeDriver();
    setDriver(driver);

    const { vocabularyRefresh } = await import("@/lib/actions");
    const llmFallback = vi.fn(async () =>
      JSON.stringify({ proposals: [{ category: "ack_quick", text: "Right on it, {honorific}." }] })
    );

    const result = await vocabularyRefresh(llmFallback);
    expect(result.total).toBe(1);
    expect(inserted.length).toBe(1);
  });

  it("rejects a too-short phrase", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const { driver, inserted } = makeDriver();
    setDriver(driver);

    const { vocabularyRefresh } = await import("@/lib/actions");
    const llmFallback = vi.fn(async () =>
      JSON.stringify({ proposals: [{ category: "ack_quick", text: "Ok" }] })
    );

    const result = await vocabularyRefresh(llmFallback);
    expect(result.total).toBe(0);
    expect(inserted.length).toBe(0);
  });

  it("returns zero when the LLM response is not valid JSON", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const { driver } = makeDriver();
    setDriver(driver);

    const { vocabularyRefresh } = await import("@/lib/actions");
    const llmFallback = vi.fn(async () => "not json at all");

    const result = await vocabularyRefresh(llmFallback);
    expect(result.total).toBe(0);
    expect(result.categories).toEqual([]);
  });

  it("returns zero when the LLM fallback returns null", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const { driver } = makeDriver();
    setDriver(driver);

    const { vocabularyRefresh } = await import("@/lib/actions");
    const llmFallback = vi.fn(async () => null);

    const result = await vocabularyRefresh(llmFallback);
    expect(result.total).toBe(0);
  });

  it("ignores a proposal for an unknown category", async () => {
    const { setDriver } = await import("@krishna/core/database/driver");
    const { driver, inserted } = makeDriver();
    setDriver(driver);

    const { vocabularyRefresh } = await import("@/lib/actions");
    const llmFallback = vi.fn(async () =>
      JSON.stringify({ proposals: [{ category: "not_a_real_category", text: "Some phrase here." }] })
    );

    const result = await vocabularyRefresh(llmFallback);
    expect(result.total).toBe(0);
    expect(inserted.length).toBe(0);
  });
});
