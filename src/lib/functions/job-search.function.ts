import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { JobListing, JobProviderConfig, TYPE_PROVIDER } from "@/types";
import { fetchAIResponse } from "./ai-response.function";

// ─── Tavily ──────────────────────────────────────────────────────────────────

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

interface TavilyResponse {
  results: TavilyResult[];
}

async function searchViaTavily(
  apiKey: string,
  query: string
): Promise<JobListing[]> {
  const res = await tauriFetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: 15,
      include_raw_content: false,
      include_domains: [
        "linkedin.com",
        "naukri.com",
        "indeed.com",
        "glassdoor.com",
        "wellfound.com",
        "unstop.com",
        "internshala.com",
        "monster.com",
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavily error ${res.status}: ${text}`);
  }

  const data: TavilyResponse = await res.json();
  return (data.results || []).map((r, i) => ({
    id: `tavily-${i}-${Date.now()}`,
    title: r.title,
    company: extractCompanyFromTitle(r.title),
    location: extractLocationFromSnippet(r.content),
    snippet: r.content?.substring(0, 300) || "",
    url: r.url,
    via: extractDomainLabel(r.url),
    postedAt: r.published_date,
  }));
}

// ─── Serper ──────────────────────────────────────────────────────────────────

interface SerperJob {
  title: string;
  company_name: string;
  location: string;
  via: string;
  description?: string;
  link?: string;
  detected_extensions?: {
    posted_at?: string;
    schedule_type?: string;
    salary?: string;
  };
  apply_options?: { title: string; link: string }[];
}

interface SerperResponse {
  jobs?: SerperJob[];
}

async function searchViaSerper(
  apiKey: string,
  query: string
): Promise<JobListing[]> {
  const res = await tauriFetch("https://google.serper.dev/jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({ q: query, num: 20 }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Serper error ${res.status}: ${text}`);
  }

  const data: SerperResponse = await res.json();
  return (data.jobs || []).map((j, i) => ({
    id: `serper-${i}-${Date.now()}`,
    title: j.title,
    company: j.company_name,
    location: j.location,
    snippet: j.description?.substring(0, 300) || "",
    url: j.link || j.apply_options?.[0]?.link || "",
    via: j.via,
    postedAt: j.detected_extensions?.posted_at,
    salary: j.detected_extensions?.salary,
    scheduleType: j.detected_extensions?.schedule_type,
  }));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Search for jobs using the configured provider (Tavily or Serper).
 * Returns raw listings without match scores — call scoreJobWithAI() separately.
 */
export async function searchJobs(
  config: JobProviderConfig,
  query: string
): Promise<JobListing[]> {
  if (config.activeProvider === "tavily") {
    return searchViaTavily(config.tavilyKey, query);
  }
  return searchViaSerper(config.serperKey, query);
}

/**
 * Builds a job search query from the user's profile goals + title hint.
 */
export function buildJobQuery(
  titleOrKeywords: string,
  location: string,
  skills?: string[]
): string {
  const parts: string[] = [];

  if (titleOrKeywords.trim()) {
    parts.push(titleOrKeywords.trim());
  }

  if (skills && skills.length > 0) {
    parts.push(`skills: ${skills.slice(0, 6).join(", ")}`);
  }

  if (location.trim()) parts.push(`in ${location.trim()}`);

  parts.push("jobs");
  return parts.join(" ");
}

/**
 * Score a single job listing against the candidate's resume using their
 * configured AI provider. Returns 0-100.
 */
export async function scoreJobWithAI(
  job: JobListing,
  resumeText: string,
  provider: TYPE_PROVIDER,
  selectedProvider: { provider: string; variables: Record<string, string> }
): Promise<number> {
  const prompt =
    `You are a professional recruiter. Score how well this candidate matches the job.\n\n` +
    `=== JOB POSTING ===\n` +
    `Title: ${job.title}\n` +
    `Company: ${job.company}\n` +
    `Location: ${job.location}\n` +
    `Description: ${job.snippet}\n\n` +
    `=== CANDIDATE RESUME (excerpt) ===\n` +
    `${resumeText.substring(0, 1500)}\n\n` +
    `Return ONLY a JSON object like: {"score": 72}\n` +
    `Score from 0 (no match) to 100 (perfect match). Consider skills, seniority, domain.`;

  let fullResponse = "";
  for await (const chunk of fetchAIResponse({
    provider,
    selectedProvider,
    systemPrompt: undefined,
    history: [],
    userMessage: prompt,
    imagesBase64: [],
  })) {
    fullResponse += chunk;
  }

  try {
    const jsonMatch = fullResponse.match(/\{[^}]*"score"\s*:\s*(\d+)[^}]*\}/);
    if (jsonMatch) {
      const score = parseInt(jsonMatch[1], 10);
      return Math.min(100, Math.max(0, score));
    }
    const numMatch = fullResponse.match(/\b([0-9]{1,3})\b/);
    if (numMatch) {
      const n = parseInt(numMatch[1], 10);
      if (n >= 0 && n <= 100) return n;
    }
  } catch {}
  return 50;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractCompanyFromTitle(title: string): string {
  const atMatch = title.match(/ at (.+)$/i);
  if (atMatch) return atMatch[1].trim();
  const dashMatch = title.match(/ [-–] (.+)$/);
  if (dashMatch) return dashMatch[1].trim();
  return "";
}

function extractLocationFromSnippet(text: string): string {
  const match = text.match(/\b([A-Z][a-z]+(?:,\s*[A-Z]{2,})?)\b/);
  return match ? match[1] : "";
}

function extractDomainLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    const domain = host.split(".")[0];
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  } catch {
    return "";
  }
}

export const SKILL_KEYWORDS = [
  "react","vue","angular","typescript","javascript","python","java","golang","rust",
  "node","express","nextjs","graphql","rest","sql","postgres","mysql","mongodb",
  "redis","aws","gcp","azure","docker","kubernetes","terraform","ci/cd","git",
  "linux","android","ios","swift","kotlin","flutter","dart","ruby","rails",
  "django","fastapi","spring","c++","c#",".net","php","laravel","scala",
  "kafka","rabbitmq","elasticsearch","spark","hadoop","airflow","mlops",
  "pytorch","tensorflow","scikit-learn","pandas","numpy","openai","llm","langchain",
  "agile","scrum","devops","leadership","architecture","microservices","delivery",
];

export function extractTopSkills(text: string, max: number = 10): string[] {
  const lower = text.toLowerCase();
  return SKILL_KEYWORDS.filter((k) => lower.includes(k)).slice(0, max);
}

/**
 * AI-powered skills extraction. Uses the user's configured LLM to read the
 * resume + goals and return the 10–15 most relevant skills. Falls back to
 * keyword matching on parse failure.
 */
export async function extractSkillsWithAI(
  resumeText: string,
  goals: string,
  provider: TYPE_PROVIDER,
  selectedProvider: { provider: string; variables: Record<string, string> }
): Promise<string[]> {
  if (!resumeText.trim()) return [];

  const prompt =
    `You are an expert technical recruiter. Read the candidate's GOALS and RESUME and return the TOP 12 most important professional skills/keywords for a job search.\n\n` +
    `Rules:\n` +
    `- Include technical skills (languages, frameworks, tools, platforms, methodologies)\n` +
    `- Include domain/industry expertise if relevant (e.g. "fintech", "healthcare", "service delivery")\n` +
    `- Include leadership/seniority signals ONLY if the candidate is clearly senior (e.g. "people management", "p&l", "stakeholder management")\n` +
    `- Lowercase, no duplicates, no explanations\n` +
    `- Return ONLY a JSON array of strings, nothing else\n\n` +
    `=== GOALS ===\n${goals.substring(0, 600)}\n\n` +
    `=== RESUME (excerpt) ===\n${resumeText.substring(0, 4000)}\n\n` +
    `JSON array:`;

  let full = "";
  try {
    for await (const chunk of fetchAIResponse({
      provider,
      selectedProvider,
      systemPrompt: undefined,
      history: [],
      userMessage: prompt,
      imagesBase64: [],
    })) {
      full += chunk;
    }
  } catch {
    return extractTopSkills(`${goals} ${resumeText}`, 12);
  }

  // Find first JSON array in response
  const match = full.match(/\[[\s\S]*?\]/);
  if (!match) return extractTopSkills(`${goals} ${resumeText}`, 12);
  try {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed)) {
      const cleaned = parsed
        .filter((s) => typeof s === "string")
        .map((s: string) => s.trim().toLowerCase())
        .filter((s) => s.length > 0 && s.length < 40);
      // De-duplicate while preserving order
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const s of cleaned) {
        if (!seen.has(s)) {
          seen.add(s);
          unique.push(s);
        }
      }
      return unique.slice(0, 15);
    }
  } catch {}
  return extractTopSkills(`${goals} ${resumeText}`, 12);
}

/**
 * Parse a job's posted-at string into "days ago".
 * Returns null when unparseable (callers should treat null as "unknown — include").
 */
export function parseJobAgeDays(postedAt?: string): number | null {
  if (!postedAt) return null;
  const raw = postedAt.trim();
  if (!raw) return null;

  // ISO / RFC date (Tavily often returns ISO)
  const iso = Date.parse(raw);
  if (!Number.isNaN(iso)) {
    const days = (Date.now() - iso) / (24 * 60 * 60 * 1000);
    return Math.max(0, days);
  }

  const lower = raw.toLowerCase();
  if (/just\s+now|moments?\s+ago|today/.test(lower)) return 0;
  if (/yesterday/.test(lower)) return 1;

  const rel = lower.match(/(\d+)\s*\+?\s*(minute|hour|day|week|month|year)s?\s*ago/);
  if (rel) {
    const num = parseInt(rel[1], 10);
    switch (rel[2]) {
      case "minute":
        return num / (60 * 24);
      case "hour":
        return num / 24;
      case "day":
        return num;
      case "week":
        return num * 7;
      case "month":
        return num * 30;
      case "year":
        return num * 365;
    }
  }
  return null;
}

/**
 * Filter listings to those posted within `maxDays`. Jobs with unparseable
 * posted_at are kept (inclusive default — better to show than hide).
 */
export function filterJobsByAge(
  listings: JobListing[],
  maxDays: number
): JobListing[] {
  return listings.filter((j) => {
    const age = parseJobAgeDays(j.postedAt);
    if (age === null) return true;
    return age <= maxDays;
  });
}
