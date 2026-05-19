# Naukri Lelo — Changelog & Application Notes

> A free, open-source AI interview assistant + job discovery tool. Built on
> **Tauri 2** (Rust backend) + **React 19 + TypeScript + Vite 7** (frontend)
> with **Shadcn UI + Tailwind 4** styling. Local-first — your resume and API
> keys never leave your machine.

---

## What this app does today

| Page              | Purpose                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard         | Configure the free OpenRouter / Groq API keys + see **Recent Job Activity** across all profiles                                    |
| Chats             | Browse past interview-prep conversations                                                                                           |
| Interview Profiles| Create/edit profiles (resume + goals). Each card has **Start Prep** and **Find Jobs** buttons                                       |
| Find Jobs         | Per-profile job search via Tavily or Serper, AI-scored against your resume, with skill chip editor + history                       |
| System Prompts    | Manage prompt library for the AI                                                                                                   |
| Dev Space         | API key configuration for: AI providers (LLMs), STT providers (speech), and **Job Discovery** (Tavily + Serper with active toggle) |
| Settings          | Theme, transparency, autostart                                                                                                     |
| Responses         | Configure response length & language                                                                                               |
| Screenshot        | Stealth screen-capture for invisible interview help                                                                                |
| Audio             | System audio devices & transcription settings                                                                                      |
| Shortcuts         | Global keyboard shortcuts + cursor settings                                                                                        |

### How the Find Jobs flow works

1. Open **Interview Profiles** → click **Find Jobs** on any profile card.
2. The Jobs page (`/profiles/:id/jobs`):
   - Loads the profile from SQLite via `getProfileById()`
   - Pre-fills the keywords box from the first line of the profile's goals
   - **AI-extracts** the top 12 skills from the resume + goals using your
     configured LLM provider (`extractSkillsWithAI()`). Falls back to regex
     keyword matching when AI is unavailable.
   - Loads any **user-edited skill overrides** from `localStorage["job_search_skills"]`
3. Click **Search** → calls `searchJobs()` which routes to Tavily or Serper
   depending on the active provider in `localStorage["job_provider"]`.
4. Results are **filtered**:
   - Non-job URLs rejected by `isJobUrl()` (LinkedIn member profiles, company
     landing pages, recruiter portals)
   - Older than 5 days rejected by `filterJobsByAge()` (parses ISO + relative
     strings like *"2 days ago"*, *"yesterday"*)
5. Each surviving result is:
   - **AI-scored 0–100** vs the resume via `scoreJobWithAI()` (top 10 only, to
     avoid rate limits)
   - **Recorded in history** via `recordJobView()` (deduped by `url+profileId`,
     auto-pruned past 7 days, capped at 500 entries)
6. Clicking **Apply** opens the listing via Tauri's secure `openUrl()` and
   marks the entry with `clickedAt` so it shows ✓✓ in the History section
   (WhatsApp-style double-tick).

### Storage keys used (`localStorage`)

| Key                  | Shape                                                                |
| -------------------- | -------------------------------------------------------------------- |
| `job_provider`       | `{ activeProvider, tavilyKey, serperKey }`                           |
| `job_history`        | `JobHistoryEntry[]` (max 500, 7-day TTL)                             |
| `job_search_skills`  | `{ [profileId]: string[] }`                                          |
| `theme`              | `"light" \| "dark" \| "system"` (default: `"light"`)                 |
| Other (existing)     | `screenshot_config`, `system_audio_*`, `curl_*`, `active_profile_id` |

### Source code map

```
src/
├── pages/
│   ├── dashboard/          # NaukriLeloApiSetup + RecentJobs card
│   ├── profiles/           # Profile list + Start Prep / Find Jobs buttons
│   ├── jobs/               # Find Jobs page + JobHistorySection
│   └── dev/components/job-discovery/  # API-key config UI with green-active indicator
├── lib/
│   ├── functions/
│   │   └── job-search.function.ts   # Tavily/Serper search, AI extractors, age + URL filters
│   ├── storage/
│   │   ├── job-providers.ts        # CRUD for API keys + active provider
│   │   ├── job-history.ts          # View/click ledger with auto-prune + day grouping
│   │   └── job-search-skills.ts    # Per-profile edited-skill overrides
│   └── database/                   # SQLite-backed InterviewProfile CRUD
├── types/
│   ├── job.ts              # JobListing, JobProviderConfig
│   └── job-history.ts      # JobHistoryEntry
├── config/constants.ts     # STORAGE_KEYS + JOB_MAX_AGE_DAYS / JOB_HISTORY_RETENTION_DAYS
└── global.css              # Light blue & white theme (v2.1.2)
```

---

## Release history

### v2.1.2 (May 18 2026)

- 🎨 **Light blue + white theme** — replaced the monochrome black/white palette
  with a sky-blue accent. Sidebar gains a soft blue tint, primary buttons,
  rings and active-states use blue 500. Default theme switched from
  `"system"` to `"light"`. Existing dark mode is retained but is now blue-tinted
  rather than pure grey, so the visual identity stays consistent if a user
  toggles it on.
- 🧹 **Filter LinkedIn member profiles** from job results — new `isJobUrl()`
  helper rejects `linkedin.com/in/…`, `/pub/`, `/sales/`, `/school/`,
  `/posts/`, `/feed/`, `/learning/`, `/company/<x>/` (without `/jobs`), plus
  Naukri recruiter pages and Indeed/Glassdoor company-landing pages. Both
  Tavily and Serper paths now run results through the filter so users only
  see real openings.
- 📝 Added this `CHANGELOG.md` as a single source of truth for application
  state. Will be kept in sync on every commit.

### v2.1.1 (May 18 2026)

- 🤖 **AI skill extraction** — `extractSkillsWithAI()` calls the user's
  configured LLM with the resume + goals and asks for the top 12 skills as
  JSON. Falls back to keyword matching on parse failure.
- 💾 **Save skills button** — appears on the Find Jobs page when chips differ
  from the saved snapshot. Stores per-profile in `localStorage["job_search_skills"]`,
  doesn't pollute the underlying interview profile.
- 📅 **5-day freshness filter** — `parseJobAgeDays()` understands ISO dates
  (Tavily) and relative strings *"2 days ago"*, *"yesterday"*, *"just now"*
  (Serper). UI shows "*N hidden (older than 5 days)*" counter.
- 🗂️ **Recent Job Activity** on the Dashboard + history section on Find Jobs.
  Per-profile filter, day-bucketed (Today / Yesterday / N days ago), WhatsApp
  ✓ (seen) / ✓✓ (opened) ticks, auto-deletes after 7 days, max 500 entries.

### v2.1.0 (May 17 2026)

- 💼 **Find Jobs button** on every Interview Profile card (next to Start Prep).
  New route `/profiles/:id/jobs`.
- 🔑 **Dev Space → Job Discovery panel** with side-by-side **Serper.dev** +
  **Tavily** cards. Active provider gets a **green border** + "Active" zap
  badge. Each provider has show/hide key input, **Test** button (live API
  ping), and **Make active** switcher. Keys saved to
  `localStorage["job_provider"]`.
- 🔎 Job search via Tavily (`api.tavily.com/search` with `include_domains`
  filter) or Serper (`google.serper.dev/jobs`). AI-scores each result 0–100
  against the candidate resume.
- 🧠 Skills extraction (regex baseline), skill chip editor, location +
  keywords search box.
- 🛠️ Build pipeline fixed — JS↔Rust Tauri package versions re-aligned, lockfile
  pinned to v2.0.7 baseline, CI tsc check green.

### v2.0.7 (April 28 2026)

- Baseline before job-discovery restoration. Pure interview-prep app with
  AI chat, profile management, system prompts, screenshot, audio, shortcuts.

---

## Job search providers — why mostly Naukri & LinkedIn?

Most results visibly come from **Naukri**, **LinkedIn**, and **Indeed**
because:

1. **Serper.dev wraps Google Jobs**, which already crawls these big boards
   directly and ranks them first. The free tier returns ~20 jobs per query;
   roughly 70 % cluster around LinkedIn / Naukri / Indeed / Glassdoor.
2. **Tavily** is a general web-search API. We restrict it to a curated domain
   list (`linkedin.com`, `naukri.com`, `indeed.com`, `glassdoor.com`,
   `wellfound.com`, `unstop.com`, `internshala.com`, `monster.com`). Smaller
   ATS-hosted boards (Workday, Greenhouse, Lever, SmartRecruiters) are not
   in that list — they could be added but each ATS has thousands of subdomains.
3. **Direct scraping is blocked** by Cloudflare on Indeed/Glassdoor for most
   IPs, by LinkedIn entirely without login, and by Naukri with aggressive bot
   detection. Going through Google Jobs (Serper) is the only practical way
   to surface these.
4. **Niche boards** (Wellfound for startups, Unstop for early-career India,
   AngelList, RemoteOK, WeWorkRemotely) don't have rich structured-data
   markup, so even when they're in Tavily's index, the title/company/location
   parsing is hit-or-miss.

To improve coverage we could (future work):

- Add a Workday/Greenhouse/Lever **direct API** path — these ATS systems
  expose public JSON endpoints per company. Requires a curated company list.
- Plug in **RapidAPI's "JSearch"** or **Adzuna** as a third provider —
  better coverage of mid-tier boards, but neither is fully free.
- Surface a **"Search source"** dropdown in Dev Space letting the user
  bias toward a specific board (e.g. "India-focused → Naukri/Foundit,
  Global → LinkedIn/Indeed").

---

## Build & release

- **CI:** `.github/workflows/ci.yml` — runs `tsc --noEmit` + `vitest run` on
  push.
- **Release:** `.github/workflows/release.yml` — triggered by `v*.*.*` tag
  push. Builds Windows `.exe`/`.msi` via `tauri-action@v0`. Publishes as a
  draft release on GitHub.
- **Versioning:** keep these three in sync — `package.json`,
  `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` (and update
  `src-tauri/Cargo.lock` for the `naukri-lelo` package entry).
- **Lockfile rule:** Tauri's JS ↔ Rust minor versions must match. Don't run
  `npm install --force`; use plain `npm ci`. If you must update deps, run
  `cargo update` in `src-tauri/` afterwards.
