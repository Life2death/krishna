import { STORAGE_KEYS } from "@/config";

type SkillsMap = Record<string, string[]>;

function readMap(): SkillsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.JOB_SEARCH_SKILLS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Read saved skills override for a profile, or null if never saved. */
export function getSavedJobSkills(profileId: string): string[] | null {
  if (!profileId) return null;
  const map = readMap();
  return Array.isArray(map[profileId]) ? map[profileId] : null;
}

/** Persist edited skills for a profile (overrides resume-extracted defaults). */
export function setSavedJobSkills(profileId: string, skills: string[]): void {
  if (!profileId) return;
  try {
    const map = readMap();
    map[profileId] = skills.map((s) => s.trim().toLowerCase()).filter(Boolean);
    localStorage.setItem(
      STORAGE_KEYS.JOB_SEARCH_SKILLS,
      JSON.stringify(map)
    );
  } catch {}
}

/** Forget saved skills for a profile (e.g. when user clicks "Reset"). */
export function clearSavedJobSkills(profileId: string): void {
  if (!profileId) return;
  try {
    const map = readMap();
    delete map[profileId];
    localStorage.setItem(
      STORAGE_KEYS.JOB_SEARCH_SKILLS,
      JSON.stringify(map)
    );
  } catch {}
}
