import { getRecentActivity } from "@/lib/database";
import { getAllMemories, createMemory } from "@/lib/repo-bound";

/**
 * Passive learning loop: distills how the user talks (tone, phrasing, recurring
 * words) from their logged utterances into a compact style profile, stored as a
 * confirmed memory. Because it's a confirmed memory it automatically syncs to
 * other devices and is injected into both classic and Live Voice prompts — so
 * Krishna gradually mirrors the user's communication style.
 */

export const STYLE_MEMORY_KEY = "communication_style";

const LAST_RUN_KEY = "krishna_style_last_run";
const MIN_NEW_UTTERANCES = 12; // run after this many new user utterances
const MIN_INTERVAL_MS = 10 * 60 * 1000; // …and at most once per 10 min
const MIN_TOTAL_UTTERANCES = 4; // need at least this much signal to say anything
const MAX_UTTERANCES = 50; // cap the sample sent to the LLM

const USER_SOURCES = new Set(["voice", "live", "text"]);

export type RunLLM = (systemPrompt: string, userMessage: string) => Promise<string>;

function getLastRun(): number {
  try {
    return Number(localStorage.getItem(LAST_RUN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function setLastRun(ts: number): void {
  try {
    localStorage.setItem(LAST_RUN_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

function isUserUtterance(r: { source?: string; transcript?: string }): boolean {
  return (
    !!r.source &&
    USER_SOURCES.has(r.source) &&
    !!r.transcript &&
    r.transcript.trim().length > 0 &&
    r.transcript !== "(no speech)"
  );
}

async function collectRecentUserUtterances(): Promise<string[]> {
  const rows = await getRecentActivity({ limit: 200 });
  return rows
    .filter(isUserUtterance)
    .slice(0, MAX_UTTERANCES)
    .map((r) => r.transcript.trim());
}

export async function getStyleProfile(): Promise<string | null> {
  const mems = await getAllMemories();
  const m = mems.find((x) => (x.key ?? "").toLowerCase() === STYLE_MEMORY_KEY);
  return m?.value ?? null;
}

async function saveStyleProfile(profile: string): Promise<void> {
  // createMemory upserts by key, so this replaces the previous profile.
  await createMemory({
    id: crypto.randomUUID(),
    key: STYLE_MEMORY_KEY,
    value: profile,
    source: "learned",
    confirmed: 1,
    createdAt: Date.now(),
    lastUsedAt: null,
  });
}

export function buildDistillPrompts(
  utterances: string[],
  existing: string | null,
): { system: string; user: string } {
  const system =
    "You analyse how one specific user talks and produce a concise style profile " +
    "so a voice assistant can mirror their communication. Capture: tone/formality, " +
    "typical sentence length, recurring words/phrases/slang, language mix, and how " +
    "they address the assistant. Output 3-6 short bullet points and nothing else. " +
    "Base it only on the samples; do NOT invent facts about the user's life or preferences.";
  const prior = existing
    ? `\n\nCurrent profile (refine it; keep what still holds, update what changed):\n${existing}`
    : "";
  const user = `User utterances (most recent first):\n${utterances
    .map((u) => "- " + u)
    .join("\n")}${prior}`;
  return { system, user };
}

/**
 * Runs the style distillation if enough new utterances have accumulated (or
 * `force`). Returns true if the profile was updated. Never throws.
 */
export async function runStyleDistillation(
  runLLM: RunLLM,
  opts?: { force?: boolean },
): Promise<boolean> {
  try {
    const now = Date.now();

    if (!opts?.force) {
      const lastRun = getLastRun();
      if (now - lastRun < MIN_INTERVAL_MS) return false;
      const rows = await getRecentActivity({ limit: 200 });
      const newCount = rows.filter(
        (r) => isUserUtterance(r) && r.createdAt > lastRun,
      ).length;
      if (newCount < MIN_NEW_UTTERANCES) return false;
    }

    const utterances = await collectRecentUserUtterances();
    if (utterances.length < MIN_TOTAL_UTTERANCES) return false;

    const existing = await getStyleProfile();
    const { system, user } = buildDistillPrompts(utterances, existing);
    const profile = (await runLLM(system, user)).trim();
    if (!profile) return false;

    await saveStyleProfile(profile);
    setLastRun(now);
    return true;
  } catch (e) {
    console.error("[learning] style distillation failed:", e);
    return false;
  }
}
