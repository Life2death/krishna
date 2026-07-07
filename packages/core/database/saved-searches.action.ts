import { getDatabase } from "./driver";
import type { SavedSearch } from "../types/saved-search";

const ALLOWED_HOSTS = ["naukri.com", "linkedin.com"];

interface DbSavedSearch {
  id: string;
  name: string;
  role_tag: string;
  url: string;
  chrome_profile_dir: string;
  chrome_profile_name: string;
  mode: string;
  resume_path_override: string | null;
  created_at: number;
}

function toSavedSearch(row: DbSavedSearch): SavedSearch {
  return {
    id: row.id,
    name: row.name,
    roleTag: row.role_tag,
    url: row.url,
    chromeProfileDir: row.chrome_profile_dir,
    chromeProfileName: row.chrome_profile_name,
    mode: row.mode as SavedSearch["mode"],
    resumePathOverride: row.resume_path_override,
    created_at: row.created_at,
  };
}

function isValidUrl(url: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.some((host) => parsed.hostname === host || parsed.hostname.endsWith("." + host))) {
      return { valid: false, reason: "URL must be on naukri.com or linkedin.com" };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: "URL is not valid" };
  }
}

export async function createSavedSearch(search: SavedSearch): Promise<{ ok: true; search: SavedSearch } | { ok: false; error: string }> {
  if (!search.name.trim()) {
    return { ok: false, error: "Name is required" };
  }

  const urlCheck = isValidUrl(search.url);
  if (!urlCheck.valid) {
    return { ok: false, error: urlCheck.reason! };
  }

  const db = await getDatabase();

  const existing = await db.select<DbSavedSearch[]>(
    "SELECT id FROM saved_searches WHERE name = ?",
    [search.name.trim()],
  );
  if (existing.length > 0) {
    return { ok: false, error: `A saved search named "${search.name}" already exists` };
  }

  await db.execute(
    `INSERT INTO saved_searches (id, name, role_tag, url, chrome_profile_dir, chrome_profile_name, mode, resume_path_override, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [search.id, search.name.trim(), search.roleTag, search.url, search.chromeProfileDir, search.chromeProfileName, search.mode, search.resumePathOverride, search.created_at],
  );
  return { ok: true, search };
}

export async function getAllSavedSearches(): Promise<SavedSearch[]> {
  const db = await getDatabase();
  const rows = await db.select<DbSavedSearch[]>(
    "SELECT * FROM saved_searches ORDER BY created_at DESC",
  );
  return rows.map(toSavedSearch);
}

export async function getSavedSearch(id: string): Promise<SavedSearch | null> {
  const db = await getDatabase();
  const rows = await db.select<DbSavedSearch[]>(
    "SELECT * FROM saved_searches WHERE id = ?",
    [id],
  );
  return rows.length > 0 ? toSavedSearch(rows[0]) : null;
}

export async function updateSavedSearch(
  id: string,
  updates: {
    name?: string;
    roleTag?: string;
    url?: string;
    chromeProfileDir?: string;
    chromeProfileName?: string;
    mode?: SavedSearch["mode"];
    resumePathOverride?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (updates.name !== undefined && !updates.name.trim()) {
    return { ok: false, error: "Name cannot be empty" };
  }

  if (updates.url !== undefined) {
    const urlCheck = isValidUrl(updates.url);
    if (!urlCheck.valid) {
      return { ok: false, error: urlCheck.reason! };
    }
  }

  const db = await getDatabase();
  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    const col = key.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
    setClauses.push(`${col} = ?`);
    values.push(value);
  }

  if (setClauses.length === 0) return { ok: true };

  values.push(id);
  await db.execute(
    `UPDATE saved_searches SET ${setClauses.join(", ")} WHERE id = ?`,
    values,
  );
  return { ok: true };
}

export async function deleteSavedSearch(id: string): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.execute(
    "DELETE FROM saved_searches WHERE id = ?",
    [id],
  );
  return result.rowsAffected > 0;
}
