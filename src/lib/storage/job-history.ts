import { JOB_HISTORY_RETENTION_DAYS, STORAGE_KEYS } from "@/config";
import { JobHistoryEntry } from "@/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

function readAll(): JobHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.JOB_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: JobHistoryEntry[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.JOB_HISTORY,
      JSON.stringify(entries.slice(0, MAX_ENTRIES))
    );
  } catch {}
}

function pruneOld(entries: JobHistoryEntry[]): JobHistoryEntry[] {
  const cutoff = Date.now() - JOB_HISTORY_RETENTION_DAYS * MS_PER_DAY;
  return entries.filter((e) => (e.viewedAt ?? 0) >= cutoff);
}

/** Get history for a specific profile (or all, when profileId omitted). Prunes old entries side-effectfully. */
export function getJobHistory(profileId?: string): JobHistoryEntry[] {
  const pruned = pruneOld(readAll());
  writeAll(pruned);
  const list = profileId
    ? pruned.filter((e) => e.profileId === profileId)
    : pruned;
  // newest first
  return [...list].sort((a, b) => b.viewedAt - a.viewedAt);
}

/** Add or refresh a job in history. Dedupes by url + profileId. */
export function recordJobView(
  entry: Omit<JobHistoryEntry, "viewedAt">
): void {
  if (!entry.url || !entry.profileId) return;
  const all = pruneOld(readAll());
  const existing = all.find(
    (e) => e.url === entry.url && e.profileId === entry.profileId
  );
  const filtered = all.filter(
    (e) => !(e.url === entry.url && e.profileId === entry.profileId)
  );
  const next: JobHistoryEntry = {
    ...entry,
    // preserve clickedAt across re-views
    clickedAt: existing?.clickedAt,
    viewedAt: Date.now(),
  };
  filtered.unshift(next);
  writeAll(filtered);
}

/** Mark a job as clicked (Apply pressed). */
export function recordJobClick(url: string, profileId: string): void {
  if (!url || !profileId) return;
  const all = readAll();
  const next = all.map((e) =>
    e.url === url && e.profileId === profileId
      ? { ...e, clickedAt: Date.now() }
      : e
  );
  writeAll(next);
}

/** Remove a single entry. */
export function removeJobHistoryEntry(url: string, profileId: string): void {
  if (!url || !profileId) return;
  const all = readAll();
  writeAll(
    all.filter((e) => !(e.url === url && e.profileId === profileId))
  );
}

/** Clear all history (rarely needed; mainly for tests). */
export function clearJobHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.JOB_HISTORY);
  } catch {}
}

/** Group an entry list by "Today", "Yesterday", "N days ago" buckets. Returns ordered groups. */
export function groupJobHistoryByDay(
  entries: JobHistoryEntry[]
): { label: string; entries: JobHistoryEntry[] }[] {
  const startOfDay = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const today = startOfDay(Date.now());
  const buckets = new Map<number, JobHistoryEntry[]>();
  for (const e of entries) {
    const key = startOfDay(e.viewedAt);
    const arr = buckets.get(key) ?? [];
    arr.push(e);
    buckets.set(key, arr);
  }
  const sortedKeys = [...buckets.keys()].sort((a, b) => b - a);
  return sortedKeys.map((k) => {
    const diffDays = Math.round((today - k) / MS_PER_DAY);
    let label: string;
    if (diffDays === 0) label = "Today";
    else if (diffDays === 1) label = "Yesterday";
    else if (diffDays < 7) label = `${diffDays} days ago`;
    else label = new Date(k).toDateString();
    return { label, entries: buckets.get(k)! };
  });
}
