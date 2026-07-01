import { isUrl } from "@/config/app-aliases";

const KEY_NOISE = /\s*\b(url|link|page|site|website)\b\s*$/i;

const TWO_PART_TLDS = new Set([
  "co.uk", "co.in", "co.jp", "co.nz", "co.za", "com.au", "com.br",
  "org.uk", "gov.uk", "ac.uk", "com.cn",
]);

type NameEntry = { host: string; path: string; name: string };
let nameEntries: NameEntry[] = [];

function parse(raw: string): { host: string; path: string } | null {
  try {
    const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = (u.pathname + u.search).replace(/\/+$/, "").toLowerCase();
    return host ? { host, path } : null;
  } catch {
    return null;
  }
}

export function setSpokenUrlNames(
  memories: { key: string | null; value: string; confirmed: number | boolean }[],
  urlAliases: { name: string; url?: string }[] = [],
): void {
  const entries: NameEntry[] = [];
  for (const m of memories) {
    if (!m.confirmed || !m.key || !m.value || !isUrl(m.value)) continue;
    const p = parse(m.value);
    if (!p) continue;
    entries.push({ ...p, name: m.key.replace(KEY_NOISE, "").trim() || m.key });
  }
  for (const a of urlAliases) {
    if (!a.url) continue;
    const p = parse(a.url);
    if (p) entries.push({ ...p, name: a.name });
  }
  nameEntries = entries;
}

export function urlToSpokenName(raw: string): string {
  const p = parse(raw);
  if (!p) return "a link";

  const full = nameEntries.find(e => e.host === p.host && e.path && e.path === p.path);
  if (full) return full.name;
  const hostOnly = nameEntries.find(e => e.host === p.host);
  if (hostOnly) return hostOnly.name;

  const labels = p.host.split(".");
  if (labels.length < 2) return "a link";
  const lastTwo = labels.slice(-2).join(".");
  const idx = TWO_PART_TLDS.has(lastTwo) ? labels.length - 3 : labels.length - 2;
  return labels[idx] || "a link";
}

export function sanitizeSpeech(text: string): string {
  return text
    .replace(/```action\n[\s\S]*?\n```/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/>\s/g, "")
    .replace(/https?:\/\/\S+/gi, (m) => urlToSpokenName(m))
    .replace(/\bwww\.\S+/gi, (m) => urlToSpokenName(m))
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}(?:\/\S*)?/gi, (m) => urlToSpokenName(m))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
