// In-memory fake DB driver tailored to the SQL that voice-lines.action.ts issues.
// Mirrors the hand-rolled-driver pattern used by the sync engine tests, avoiding a
// real @libsql/client (whose native binding hangs vitest's worker threads).
// Shared by voice-lines.test.ts and canned-responses.test.ts.

const COLS = [
  "id", "category", "lang", "text", "source", "enabled",
  "weight", "last_used_at", "use_count", "created_at", "tod",
] as const;

export function makeFakeVoiceLinesDriver() {
  const rows: Record<string, unknown>[] = [];
  return {
    async execute(sql: string, p: unknown[] = []) {
      if (/CREATE TABLE|CREATE INDEX/i.test(sql)) return { rowsAffected: 0 };
      if (/INSERT INTO voice_lines/i.test(sql)) {
        const row: Record<string, unknown> = {};
        COLS.forEach((c, i) => { row[c] = p[i] ?? null; });
        rows.push(row);
        return { rowsAffected: 1 };
      }
      if (/UPDATE voice_lines SET last_used_at/i.test(sql)) {
        const [lastUsed, id] = p as [number, string];
        const r = rows.find((x) => x.id === id);
        if (r) { r.last_used_at = lastUsed; r.use_count = ((r.use_count as number) || 0) + 1; }
        return { rowsAffected: r ? 1 : 0 };
      }
      if (/UPDATE voice_lines SET enabled = 0/i.test(sql)) {
        const [id] = p as [string];
        const r = rows.find((x) => x.id === id);
        if (r) r.enabled = 0;
        return { rowsAffected: r ? 1 : 0 };
      }
      return { rowsAffected: 0 };
    },
    async select<T>(sql: string, p: unknown[] = []): Promise<T> {
      if (/SELECT id FROM voice_lines/i.test(sql)) {
        const [category, limit] = p as [string, number];
        return rows
          .filter((r) => r.category === category && r.last_used_at != null)
          .sort((a, b) => (b.last_used_at as number) - (a.last_used_at as number))
          .slice(0, limit)
          .map((r) => ({ id: r.id })) as unknown as T;
      }
      if (/WHERE category = \? ORDER BY lang/i.test(sql)) {
        const [category] = p as [string];
        return rows
          .filter((r) => r.category === category)
          .sort((a, b) => String(a.lang).localeCompare(String(b.lang)) || (b.weight as number) - (a.weight as number)) as unknown as T;
      }
      if (/SELECT \* FROM voice_lines/i.test(sql)) {
        const [category, lang] = p as [string, string];
        return rows
          .filter((r) => r.category === category && r.lang === lang && r.enabled === 1)
          .sort((a, b) => (b.weight as number) - (a.weight as number)) as unknown as T;
      }
      return [] as unknown as T;
    },
  };
}
