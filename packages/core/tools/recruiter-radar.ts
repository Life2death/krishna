import { getSeenIds, getLastCheckAt, markSeen, setLastCheckAt } from "./recruiter-radar-state";

export interface Candidate {
  id: string;
  from: string;
  subject: string;
  snippet: string;
}

export type CandidateClass = "recruiter_outreach" | "job_alert_digest" | "other";

export interface Classification {
  id: string;
  class: CandidateClass;
  recruiterName?: string;
  company?: string;
  roleTitle?: string;
  via?: "direct" | "linkedin" | "naukri" | "other";
}

export interface RecruiterRadarResult {
  outreach: Classification[];
  totalFetched: number;
  capHit: boolean;
  degraded: boolean;
  error?: string;
}

export const MAX_CANDIDATES = 25;
export const MAX_WINDOW_DAYS = 14;
export const COLD_START_DAYS = 7;

const DIGEST_SENDERS = [
  "jobs-noreply@linkedin.com",
  "noreply@naukri.com",
  "noreply@indeed.com",
  "jobs-list@linkedin.com",
];

const SUBJECT_OUTREACH_RE = /(jd|job|opening|opportunity|hiring|requirement|cv|resume|profile|shortlisted)/i;

function detectVia(from: string): "linkedin" | "naukri" | "direct" {
  const lower = from.toLowerCase();
  if (lower.includes("linkedin")) return "linkedin";
  if (lower.includes("naukri")) return "naukri";
  return "direct";
}

function isDigestSender(from: string): boolean {
  return DIGEST_SENDERS.some((s) => from.toLowerCase().includes(s.toLowerCase()));
}

function heuristicClassify(candidate: Candidate): Classification {
  const isDigest = isDigestSender(candidate.from);
  const matchesSubject = SUBJECT_OUTREACH_RE.test(candidate.subject);

  if (isDigest) {
    return { id: candidate.id, class: "job_alert_digest", via: detectVia(candidate.from) };
  }
  if (matchesSubject) {
    return { id: candidate.id, class: "recruiter_outreach", via: detectVia(candidate.from) };
  }
  return { id: candidate.id, class: "other", via: detectVia(candidate.from) };
}

function isValidClassifications(
  classifications: unknown,
  candidates: Candidate[],
): classifications is Classification[] {
  if (!Array.isArray(classifications)) return false;
  if (classifications.length !== candidates.length) return false;
  const validClasses = new Set<CandidateClass>(["recruiter_outreach", "job_alert_digest", "other"]);
  if (!classifications.every(
    (c: unknown) =>
      c &&
      typeof c === "object" &&
      typeof (c as Classification).id === "string" &&
      validClasses.has((c as Classification).class) &&
      candidates.some((cand) => cand.id === (c as Classification).id),
  )) return false;
  const returnedIds = new Set(classifications.map((c: Classification) => c.id));
  const candidateIds = new Set(candidates.map((c) => c.id));
  if (returnedIds.size !== candidateIds.size) return false;
  for (const id of returnedIds) if (!candidateIds.has(id)) return false;
  return true;
}

export async function checkRecruiters(
  candidates: Candidate[],
  classify: (candidates: Candidate[]) => Promise<Classification[]>,
  capHit?: boolean,
): Promise<RecruiterRadarResult> {
  if (candidates.length === 0) {
    return { outreach: [], totalFetched: 0, capHit: false, degraded: false };
  }

  let classifications: Classification[];
  let degraded = false;
  let classifyError: string | undefined;

  try {
    classifications = await classify(candidates);
    if (!isValidClassifications(classifications, candidates)) {
      throw new Error("Classification output validation failed");
    }
  } catch (err) {
    degraded = true;
    classifyError = err instanceof Error ? err.message : String(err);
    classifications = candidates.map(heuristicClassify);
  }

  const outreach = classifications.filter((c) => c.class === "recruiter_outreach");

  return {
    outreach,
    totalFetched: candidates.length,
    capHit: capHit ?? candidates.length >= MAX_CANDIDATES,
    degraded,
    error: classifyError,
  };
}

export function formatRecruiterOutput(
  outreach: Classification[],
  candidates: Candidate[],
  options: { since: number; capHit: boolean; degraded: boolean },
): string {
  const sinceWords = formatSince(options.since);

  if (outreach.length === 0) {
    const hedge = options.degraded ? "Roughly, sir — my filter is running blind: " : "";
    const capNote = options.capHit ? ` I checked the last ${MAX_CANDIDATES} messages.` : "";
    return `${hedge}No new recruiter emails since ${sinceWords}, sir.${capNote}`;
  }

  const lines: string[] = [];
  if (options.degraded) {
    lines.push("Roughly, sir — my filter is running blind:");
  }

  const top = outreach.slice(0, 3);
  for (const item of top) {
    const cand = candidates.find((c) => c.id === item.id);
    const label = buildBrief(item, cand);
    lines.push(label);
  }

  const extra = outreach.length - 3;
  if (extra > 0) {
    lines.push(`…and ${extra} more, sir — they're on your recruiter list.`);
  }

  const capNote = options.capHit ? ` I checked the last ${MAX_CANDIDATES} messages.` : "";
  return lines.join("\n") + capNote;
}

export function normalizeRecruiterSubject(text: string): string {
  return text
    .replace(/\u2014/g, ",")
    .replace(/\u2013/g, ",")
    .replace(/--/g, ", ")
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) => {
      const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      }
      return `${y} ${m} ${d}`;
    });
}

function buildBrief(item: Classification, candidate?: Candidate): string {
  const parts: string[] = [];

  if (item.recruiterName) parts.push(item.recruiterName);
  if (item.company) parts.push(`from ${item.company}`);
  if (item.roleTitle) parts.push(`about a ${item.roleTitle} role`);
  if (item.via && item.via !== "direct") parts.push(`via ${item.via}`);

  if (parts.length > 0) return parts.join(" ") + ".";

  const displayName = candidate
    ? (() => {
        const hasBrackets = /<[^>]+>/.test(candidate.from);
        const extracted = hasBrackets
          ? candidate.from.replace(/<[^>]+>/g, "").trim()
          : "";
        return extracted || candidate.from.split("@")[0].trim();
      })()
    : "";
  const subj = candidate ? normalizeRecruiterSubject(candidate.subject) : "";
  const fallback = displayName ? `${displayName}, "${subj}"` : `A message from your inbox`;
  return fallback;
}

export async function runRecruiterRadar(
  candidates: Candidate[],
  classify: (c: Candidate[]) => Promise<Classification[]>,
  opts?: { windowDays?: number; capHit?: boolean },
): Promise<{ result: RecruiterRadarResult; newOutreach: Classification[]; since: number }> {
  const seenIds = await getSeenIds();
  const since = opts?.windowDays
    ? Date.now() - opts.windowDays * 86400000
    : (await getLastCheckAt()) || Date.now() - COLD_START_DAYS * 86400000;

  const result = await checkRecruiters(candidates, classify, opts?.capHit);

  const newOutreach = opts?.windowDays
    ? result.outreach
    : result.outreach.filter((o) => !seenIds.has(o.id));

  const now = Date.now();
  await markSeen(candidates.map((c) => c.id), now);
  await setLastCheckAt(now);

  return { result, newOutreach, since };
}

export function formatSince(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;

  if (diffMs < 0) return "just now";

  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) {
    if (diffMin === 1) return "1 minute ago";
    return `${diffMin} minutes ago`;
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 6) {
    if (diffHours === 1) return "1 hour ago";
    return `${diffHours} hours ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 1) {
    const hour = new Date(timestamp).getHours();
    if (hour >= 5 && hour < 12) return "this morning";
    if (hour >= 12 && hour < 17) return "this afternoon";
    return "earlier today";
  }
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "last week";
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

  const date = new Date(timestamp);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
