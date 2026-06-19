# Krishna — Changelog & Application Notes

> A free, open-source AI voice assistant. Built on **Tauri 2** (Rust
> backend) + **React 19 + TypeScript + Vite 7** (frontend) with **Shadcn UI
> + Tailwind 4** styling. Local-first — your API keys never
> leave your machine.
>
> _Previously branded **Naukri Lelo** (interview assistant), then **Focus Assistant**.
> Now rebranded as **Krishna** — a pure voice AI desktop assistant._

---

---

## v1.3.0 (2026-06-19) — Phase 0: Workspace Restructure + Pluggable SqlDriver

**Monorepo workspace with `packages/core/` — framework-free business logic extracted as a reusable package:**

- **`packages/core/`** — new npm workspace package containing all framework-free code:
  - Types, database actions, tools, functions, and shared utilities
  - Injectable `SqlDriver` interface (matches Tauri plugin-sql signatures exactly)
  - Injectable `HttpFetchFn` for platform-agnostic HTTP
  - Injectable `SettingsGetter` and `SecretGetter` for platform-agnostic config/secrets
  - Dynamic config import support (`action-policy.ts`, `app-aliases.ts`)
  - All imports use relative paths (no `@/` aliases)
- **Client re-exports:** All `src/lib/` barrel files now re-export from `@krishna/core/*`
- **`startup.ts` wiring** — `setDriver()`, `setHttpFetch()`, `setSettingsGetter()`, `setSecretGetter()` called before React render in `main.tsx`
- **`vitest.config.ts` fix** — added `@` alias for test resolution; all 13 test suites import correctly
- **npm workspaces** — `"workspaces": ["packages/core"]` in root `package.json`; workspace symlink at `node_modules/@krishna/core` → `packages/core`

**Zero user-visible change** — old source files remain in place as re-export wrappers or original code for direct-import compatibility.

**Verification:**
- `npx tsc --noEmit` clean
- `npx vite build` successful (6993 modules, 20s)
- 192/192 tests pass across 13 test files

**Phase 6 cleanup (UX_CONSOLIDATION_PLAN.md + PHASE_7_FIXES.md):**

- **Wake word (Item 1):** Configurable gate wired into `processCommand` — "Require wake word" toggle + custom phrase in Krishna Settings. Uses `detectWakeWord()` (fuzzy + custom word patterns)
- **Unified chat store (Item 2):** SQLite is now the single source of truth for voice conversation history. Overlay + Dashboard backed by the same store. Old `krishna_conversation_history` localStorage key no longer used. `appendMessages()` helper added, session model with 15-min idle threshold creates new conversations automatically
- **Delete conversations UI (Item 3):** Trash icon per conversation card with inline confirm, "Clear all" button in Dashboard, clear button in overlay header
- **Error banner on Dashboard (Item 4):** Surfaces `krishna.lastError` with dismiss control
- **Dashboard merge (Item 5):** Dashboard now shows the full conversation list (replaces placeholder). "Chats" nav item and route removed. `/chats/view/:id` preserved
- **Settings merge (Item 6):** Response components (Length, Language, AutoScroll) imported into Settings page. "Responses" nav item and route removed
- **Cross-window sync:** Dashboard refreshes on window focus/visibilitychange — live updates from overlay
- **Alias fix:** Removed incorrect `"visual studio"` from VS Code aliases (Visual Studio ≠ VS Code)
- **Cleanups:** Deleted dead `pages/chats/index.tsx` and `pages/responses/index.tsx`, fixed stray whitespace in `useMenuItems.tsx`

**Verification:**
- `npx tsc --noEmit` clean
- 164/164 tests pass

---

## v1.1.0 (2026-06-14) — Interview features removed, full Krishna rebrand

**What changed:**
- Removed Interview Profiles, Job search/discovery, and Naukri-Lelo API mode
- Stripped all interview-prep context injection from AI prompts
- Rebranded all user-facing strings from "Focus Assistant" / "Naukri Lelo" to "Krishna"
- Removed 25+ files, updated 6 barrel exports, cleaned up config keys
- Cleared the two interview prompt presets from the Templates dropdown
- Updated documentation (CHANGELOG, README, PROJECT_STRUCTURE)

**Verification:**
- `npx tsc --noEmit` clean (except pre-existing `minSpeechFrames` error)
- 164/164 tests pass
- Zero grep matches for `interview`, `Naukri Lelo`, `Focus Assistant` in `src/`

---

## What this app does today

| Page         | Purpose                                                                 |
|--------------|-------------------------------------------------------------------------|
| Dashboard    | Configure AI + STT API keys and view usage                              |
| Chats        | Browse past conversations                                                |
| System Prompts | Manage prompt library for the AI                                      |
| Dev Space    | API key configuration for AI providers (LLMs) and STT providers (speech) |
| Settings     | Theme, transparency, autostart, Krishna assistant config                 |
| Responses    | Configure response length & language                                    |
| Screenshot   | Stealth screen-capture for AI screenshot analysis                        |
| Audio        | System audio devices & transcription settings                            |
| Shortcuts    | Global keyboard shortcuts + cursor settings                             |

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

| Key                          | Shape                                                                |
| ---------------------------- | -------------------------------------------------------------------- |
| `job_provider`               | `{ activeProvider, tavilyKey, serperKey }`                           |
| `job_history`                | `JobHistoryEntry[]` (max 500, 7-day TTL)                             |
| `job_search_skills`          | `{ [profileId]: string[] }`                                          |
| `theme`                      | `"light" \| "dark" \| "system"` (default: `"light"`)                 |
| `teleprompter_enabled`       | `"true" \| "false"` — gates the footer toggle                        |
| `teleprompter_font_size`     | `string` (10–36, default 13)                                         |
| `teleprompter_opacity`       | `string` (0.35–1.0, default 0.92)                                    |
| Other (existing)             | `screenshot_config`, `system_audio_*`, `curl_*`, `active_profile_id` |

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

### v6.1.0 (June 13 2026) — Krishna Phase 5 Complete

- 🧠 **Phase 5.1: Memory & Context** — rolling conversation history buffer (last 8 messages),
  `memories` table (v9), `parseRememberCommand` for "remember that…" intents,
  `buildMemoryPrompt` injection into system prompt, "undo that" support, settings UI.
- 👁️ **Phase 5.3a: Perception** — `isLookCommand()` detects "what's on my screen" /
  "summarize this" intents → screen capture → AI vision description. 9 tests.
- 🔐 **Phase 5.3b: Trust Layer** — `audit_log` table (v10), `classifyAction()` permission tiers
  (safe/sensitive), `isUndoCommand`, undo handler (reverses memory/reminder entries),
  central audit logging at 5 success points, settings UI. 11 tests.
- ⏰ **Phase 5.3c: Proactivity** — `reminders` table (v11), `parseReminderCommand()` (7 time
  formats), 30s scheduler (`setInterval` in KrishnaProvider) that speaks due reminders,
  handles recurrence (daily/weekly), logs to audit, auto-disables one-time. 12 tests.
- 🔫 **Permission gate wired** — `classifyAction` now enforced in `executor.ts`: sensitive
  tools are rejected before execution. 1 test + 8 loc.
- 🪟 **Build fix** — removed invalid `additionalAudioConstraints` prop from `AutoSpeechVad.tsx`
  (caused `tsc` failure). `tsc --noEmit` now fully clean.
- 📦 **CI/CD** — `.github/workflows/release.yml`: tags-only pipeline with `contents:write`,
  `Swatinem/rust-cache`, Rust + frontend tests, Tauri build → draft release.
- ✅ **189 tests passing** (up from 156), 14 test files, all green.
- 📄 **`PROJECT_STRUCTURE.md`** — comprehensive codebase reference added.

### v6.0.0 (June 10 2026)

- 🐛 **Fix: app failed to launch on existing installs (startup panic).**
  `tauri-plugin-sql` (sqlx) stores a SHA-384 of each migration's raw bytes and
  re-verifies it on every launch. On Windows, git `autocrlf` checked out
  `src-tauri/src/db/migrations/*.sql` with CRLF, changing the hash versus the LF
  checksum recorded in the existing database → integrity check failed →
  `.expect()` panic at `src-tauri/src/lib.rs:285`. Every build, even older ones,
  crashed against an existing DB.
- 🔧 **Added `.gitattributes` pinning `*.sql` (and the migration files) to
  `eol=lf`** so migration checksums are byte-stable across every OS and checkout.
  Working tree renormalized to LF. Migrations remain immutable — future schema
  changes must be added as a new migration version, never by editing a shipped one.
- 🔖 **Version unified to 6.0.0** across `package.json`, `tauri.conf.json`,
  `Cargo.toml`, and `Cargo.lock` (previously drifted: 5.0.0 in the frontend vs
  2.2.1 in the Rust crate, so the app reported itself as v2.2.1).

### v2.2.1 (May 20 2026)

- 🐛 **Fix: teleprompter showed an empty window when chatting from the
  floating overlay.** v2.1.3 wired `pushTeleprompterText` into
  `useChatCompletion.ts` (the expanded `/chats` page), but the
  floating overlay uses a *different* hook — `useCompletion.ts` — and
  that path never emitted the event. So the teleprompter window opened
  correctly, the event listener registered correctly, but nothing was
  ever sent. Added `clearTeleprompterText()` before each request and
  `pushTeleprompterText(fullResponse)` inside both streaming loops
  (plain text + screenshot/image-attached) in `useCompletion.ts`.
- 🔓 **Restored window-control permissions on the teleprompter capability.**
  v2.2.0 created an isolated `teleprompter.json` capability with only
  `core:default` + `core:event:default`. That was too strict — it broke
  the in-window X button, drag-to-move, and resize-handles that
  v2.1.8 added. Added back the three permissions the UI actually
  needs: `core:window:allow-close`, `allow-start-dragging`,
  `allow-start-resize-dragging`. The window still cannot create
  sub-windows, run shell, access SQL/keychain/HTTP, etc. — the
  security envelope stays tight.

### v2.2.0 (May 20 2026)

- 🔐 **Security hardening release** (commit 8dff2fb, pushed from secondary
  dev machine). Highlights:
  - `secure_storage.json` now encrypted at rest with AES-256-GCM using a
    machine-derived key.
  - API keys back-stored in the OS keychain (Windows Credential Manager,
    macOS Keychain, libsecret on Linux).
  - XSS sanitisation for AI-generated markdown output in
    `src/components/Markdown/index.tsx`.
  - Screen/audio capture IPC restricted to the main window only —
    overlay/teleprompter/sub-windows can no longer trigger capture.
  - New isolated `teleprompter` Tauri capability (windows list scoped
    to `teleprompter` only).
  - Runtime permission validation for capture commands.
  - `reqwest` switched to `rustls-tls` (avoids transitive `openssl` CVEs).
- 🩹 Follow-up fix commits 72f2a5e + 1bcc7eb addressed Rust + TS build
  failures introduced by the rewrites (invalid keychain command names,
  an unused `KEYCHAIN_SERVICE` constant).

### v2.1.9 (May 20 2026)

- 📌 **Profile context banner in the overlay chat.** The floating overlay has
  been combining the active Interview Profile (resume + goals + custom docs
  + reference conversations) with the selected System Prompt for a while —
  `useCompletion.ts → buildEffectiveSystemPrompt() → buildProfileKnowledgeContext()`.
  But nothing in the UI told you it was happening. Added a thin banner at
  the top of the response panel that reads e.g. "Answering as Director
  Delivery · resume + goals + 1 doc + 2 ref convs" so you can verify the
  AI is using the right context before asking a question.
  - Reads `activeProfileId` from `AppContext`; renders nothing when no
    profile is active.
  - Pulls counts: `profile.documents.length` and the on-disk
    `profile_refs_<id>` localStorage array (saved Prep-Session conversations).
- ⚡ **CI: type check now runs before Rust setup.** v2.1.7 burned ~2 min on
  Cargo cache restore + Tauri bootstrap before failing on a trivial TS2578.
  Added `npm run typecheck` (a thin `tsc --noEmit` wrapper) as an explicit
  step in `.github/workflows/release.yml` immediately after `npm ci`. Future
  TypeScript errors will fail the release build in <30 s instead of ~2 min,
  so iteration is faster. Same check now also gates every push.

### v2.1.8 (May 20 2026)

- 🔧 **Build fix for v2.1.7.** TypeScript rejected the two `@ts-expect-error`
  directives I wrote around the `startResizeDragging` fallback because the
  Tauri 2.x type bundle does already expose the method. Refactored the
  fallback to use a proper structural cast and a clean `typeof fn ===
  "function"` runtime check — no suppression directives, no type warnings,
  same runtime behaviour. (v2.1.7 had no installer because of this; install
  v2.1.8 instead.)

### v2.1.7 (May 20 2026)

- 🐛 **Fix: teleprompter window never actually opened.** The WebviewWindow
  URL was `index.html#/teleprompter` (hash routing) but the app uses
  `BrowserRouter`, which ignores the hash. So Tauri created the window,
  loaded `index.html`, and React Router resolved `/` → `<App />` instead
  of `<Teleprompter />` — the window was invisible/empty so it looked
  like nothing happened.
  - Switched to the same pattern the `capture-overlay-*` windows already
    use: URL is plain `index.html`, and `main.tsx` dispatches on the
    window label to render `<Teleprompter />` directly without the
    router/AppProvider tree.
  - Removed the now-redundant `/teleprompter` route from `AppRoutes`.
- 🖱️ **Fix: window can now be resized with the mouse.** The overlay had
  `resizable: true` but `decorations: false`, so the OS drew no grab
  handles. Added eight CSS-positioned hot-zones (4 edges + 4 corners)
  inside the teleprompter; each one calls Tauri's
  `start_resize_dragging` IPC with the appropriate direction on
  `mousedown`. The bottom-right corner also shows a subtle three-line
  visual grip so it's discoverable. The required permission
  `core:window:allow-start-resize-dragging` was added to both
  capability files.
- The overlay is also fully draggable — grab the header bar to move it.

### v2.1.6 (May 19 2026)

- 🩹 **Restored bundle identifier to `com.naukrilelo.app`.** v2.1.3 renamed
  the bundle ID to `com.focusassistant.app` along with the visible rebrand.
  Tauri scopes per-user data (SQLite database + WebView2 localStorage) by
  bundle ID, so upgraders found their interview profiles, system prompts,
  chat history, API keys, and job history appearing "empty" — the data was
  actually intact at the old `%APPDATA%\com.naukrilelo.app\` path; the new
  build was just reading from a fresh `com.focusassistant.app\` folder.
  Reverting the identifier makes the app read from the original location
  again, so all previously-stored data reappears with no manual migration.
- Task Manager display, window title, sidebar header and installer name
  continue to show "Focus Assistant" — only the under-the-hood bundle ID
  string changes. The `naukrilelo` token in the bundle ID is not surfaced
  anywhere visible to a user during normal use (it shows only deep in the
  Windows registry under `Installer/UserData`).

### v2.1.5 (May 19 2026)

- 🧹 **Removed defunct "Naukri Lelo Prompts" section from System Prompts page.**
  This section was a remnant from a decommissioned cloud prompt-library
  service. The remote API was removed back in commit `f236e72` ("Free
  version with license removed"), but the consuming UI was left in place,
  showing a perpetual "Naukri Lelo API Not Enabled" empty state because
  there's no UI to ever flip the flag. Deleted the unused
  `NaukriLeloPrompts.tsx` component; the user's local SQLite-backed system
  prompts (top of the page) are unchanged and continue to work normally.

### v2.1.4 (May 19 2026)

- 🐛 **Fix: Teleprompter toggle now arms the Save Changes button.** The toggle
  was previously auto-saving on click (matching the AlwaysOnTop pattern), which
  was inconsistent with the rest of the Settings page where Theme and
  Transparency live behind a single "Save Changes" button. Refactored
  `TeleprompterToggle` into a controlled component owned by the Settings
  page — clicking the switch now flips a pending state, the Save Changes
  button enables, and the value persists on click. Closing the teleprompter
  window when turning off is moved into the Save handler too.

### v2.1.3 (May 19 2026)

- 🪪 **Rebranded to "Focus Assistant"** — productName, identifier, bundle ID,
  window title, sidebar header, error layout, "Quit X" menu item, Dashboard
  copy, and Contribute/Promote cards all updated. The `.exe` is now
  `Focus Assistant.exe` in Task Manager. The GitHub repo stays
  `naukri-lelo-v2` (issue history continuity); only the installed binary
  carries the new identity.
- 🎨 **New icon** — neutral focus-reticle design (blue gradient circle, thin
  white concentric rings, centred dot). Generated by
  `scripts/generate-icons.py` (Pillow). Replaces all PNG/ICO/ICNS variants
  under `src-tauri/icons/`.
- 📺 **Teleprompter / Reading Mode** — new floating overlay window pinned to
  the top of the primary monitor (just below the webcam) so reading-gaze
  deviation stays minimal during video calls.
  - New `App Settings → Teleprompter` toggle. When on, a small
    "Reading Mode" pill appears anchored to the bottom of the app — click
    to open/close the overlay.
  - Overlay is a separate Tauri webview window (label `teleprompter`),
    transparent, always-on-top, no decorations, drag-region in the header.
  - Live AI answers stream into the overlay via the Tauri event bus
    (`teleprompter:update`) — the main chat stream pushes each accumulated
    response chunk; the overlay subscribes and re-renders. New questions
    clear the prior answer (`teleprompter:clear`).
  - Per-overlay controls: **font-size +/-** (10 – 36 px), **opacity +/-**
    (35 – 100 %), **close**. Font and opacity preferences persist in
    `localStorage`.
  - Capabilities updated: both `default.json` and `cross-platform.json` now
    permit `core:webview:allow-create-webview-window`, position/size
    setters, focus, current-monitor, and the event channel — scoped to the
    `teleprompter` window.

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
