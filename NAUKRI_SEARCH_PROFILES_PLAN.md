# Naukri saved searches + per-role Chrome profiles + assisted apply (design)

> Owner request 2026-07-06. Owner context: he runs **separate Chrome profiles per Naukri
> role** — one profile logged in as Director-track, one as Program-Manager-track, one as
> Scrum-Master-track — and has long search URLs per role/region (e.g. the PM query for
> Mumbai/Navi Mumbai/Pune). He wants: "Krishna, open my program manager search" → correct
> Chrome profile opens the saved URL (already logged in) → he applies manually, OR later
> Krishna assists the apply like the LinkedIn J4 flow.
> Reviewer-authored spec; agent codes in `krishna-m15`, branch fresh off `main` (suggest
> `feat/naukri-searches`). Findings ledger: `NAUKRI_REVIEW_FINDINGS.md`. One phase per
> commit, `tsc --noEmit` + `vitest run` green, STOP per phase.

## What exists already (reuse, don't rebuild)
- **J1 alias/open pipeline:** `resolveAppAlias` (`src/config/app-aliases.ts`) + `open_target`
  (`src-tauri/src/assistant.rs:19`) already turn "open the job pipeline" into a URL launch.
  But aliases are static config — saved searches are user data and belong in the DB.
- **J3 ApplicationProfile:** keyed memory-store row in SQLCipher (NOT localStorage — §6
  gotcha, bit us in J4-b). Same storage pattern for saved searches.
- **J4-a/b/c CDP pipeline:** in-app CDP client over the debug Chrome (`localhost:9222`,
  `--user-data-dir="C:\chrome-krishna"`), Easy-Apply click, field-fill from profile,
  confirm-gated submit. J4b-Naukri is already queued in `RESUME_HERE.md` §4 as the
  port-to-Naukri of this pattern — **this spec's N4 phase IS that item**, now with profile
  awareness added.
- Owner already stays logged in inside the debug Chrome; the app stores no passwords
  (by design — sessions live in Chrome profiles, never in Krishna).

## Key design decisions

### D1 — Two launch modes, cleanly separated
- **Manual mode (default, N1–N3):** launch the owner's **normal** Chrome with
  `--profile-directory="<dir>"` + the saved URL. Owner applies by hand, already logged in.
  Zero CDP involvement, works today, no debug flags needed.
- **Assisted mode (N4):** must run inside the **debug** Chrome instance (CDP only talks to
  the instance with the debug port). Chrome supports multiple profiles *within* one
  `user-data-dir`: the owner creates Director/PM/SM profiles inside `C:\chrome-krishna`
  once, logs each into its Naukri account, and CDP sees page targets across all of them.
  A saved search stores which profile it belongs to; assisted-apply verifies the active
  target's profile before acting (mis-profile apply = wrong account, unrecoverable —
  refuse loudly rather than guess).

### D2 — Profile names resolved from Chrome's own registry
Chrome's `<user-data-dir>\Local State` JSON (`profile.info_cache`) maps directory keys
(`Default`, `Profile 1`, …) to human names ("Director", "PM", …). Read it (Rust, read-only)
to let the owner pick profiles by *name* in Settings and by voice ("my director profile"),
instead of memorizing "Profile 3". Read at Settings-open time, never cached stale.

### D3 — Stored-URL domain allowlist
Saved-search URLs are restricted to `naukri.com` / `linkedin.com` hosts at save time.
This feature must not become a general "Krishna, launch arbitrary URL in profile X" vector;
`open_target`'s existing dangerous-target checks stay in the path regardless.

### D4 — One ApplicationProfile vs three roles (OWNER DECISION NEEDED before N4)
J3's ApplicationProfile is a single 12-field row. Assisted apply for three different roles
implies role-specific resumes/headlines at minimum. Options: (a) one shared profile +
per-search `resumePath` override field, (b) full per-role ApplicationProfiles (J3 schema
change). Recommend (a) — smallest schema delta, matches the actual difference between the
roles (resume + maybe notice-period stay identical). N1's schema includes the optional
`resumePathOverride` so (a) needs no later migration. **Do not start N4 until the owner
picks.** N1–N3 are unaffected either way.

## Phases

### N1 — Saved-search store (schema + CRUD, no UI yet)
Memory-store keyed rows (SQLCipher, same mechanism as J3):
`saved_searches`: `{ id, name ("PM Mumbai belt"), roleTag ("program-manager" |
"director" | "scrum-master" | free text), url, chromeProfileDir ("Profile 1"),
chromeProfileName ("PM"), mode ("manual" | "assisted"), resumePathOverride?, createdAt }`.
- Validation at save: URL host ∈ allowlist (D3), non-empty name unique.
- Unit tests drive the real store functions against the real (test) DB seam — §6 rule; the
  J4-b localStorage mistake is the cautionary tale here.
- Seed nothing; the owner's URLs go in via N2's UI (his PM/Mumbai example goes in then).

### N2 — Settings UI + profile picker
- New Settings section "Job Searches": list/add/edit/delete saved searches.
- Profile dropdown populated from a new Rust command `list_chrome_profiles(userDataDir?)` —
  reads `Local State` (D2) of (a) default Chrome profile dir and (b) `C:\chrome-krishna`;
  labels which instance each came from. Read-only, no ACL surprises (plain fs read of a
  user file — confirm Tauri fs scope allows it or do it in Rust, which needs no scope).
- Store BOTH `chromeProfileDir` and the display name (name is for speech; dir is what
  launches).

### N3 — Launch command + voice tool
- Rust `open_in_chrome_profile(url, profileDir, debug: bool)`:
  - `debug=false` (manual mode): spawn the installed `chrome.exe` (resolve from the
    standard install paths / App Paths registry key — do NOT shell out to `start chrome`,
    which loses arg control) with `--profile-directory="<dir>" "<url>"`. If normal Chrome
    is already running this opens a new window in that profile — correct behavior.
  - `debug=true` (assisted mode): same but adds the three debug flags with
    `--user-data-dir="C:\chrome-krishna"`; if the debug instance is already up (probe
    `localhost:9222/json/version`, the J4 client already knows how), just open a new tab
    in the right profile via CDP `Target.createTarget` instead of spawning.
  - URL host re-validated against D3 allowlist at launch time (defense in depth).
- New tool `open_saved_search(name_or_role)`: fuzzy-match saved searches by name/roleTag
  ("open my program manager naukri search", "open naukri for director roles") → launch per
  the search's stored mode → spoken status ("Opening your PM search in the PM profile,
  sir — three windows of opportunity."). Ambiguous match → speak the candidates, don't
  guess. KNOWN_SAFE-adjacent: opening a browser tab is a status action, no confirm gate.
- **New external host rule check (§6):** no new fetch hosts here (launching ≠ fetching),
  but if N4 later calls Naukri APIs, allowlist+CSP land in the SAME commit.

### N4 — Assisted apply on Naukri (= the queued J4b-Naukri item, profile-aware)
Repeat the J4-a/b/c pattern with Naukri-specific reality (blocked on D4 owner decision):
- **Open:** from the saved search's queue/page in the *correct debug-Chrome profile*
  (verify via CDP `Browser.getWindowForTarget` / target's browser context ↔ expected
  profile; mismatch → refuse and say which profile is open).
- **Apply-button taxonomy:** Naukri has "Apply" (on-site) vs "Apply on company site"
  (external — report, don't click, mirroring J4-a's Easy-Apply-only rule) vs
  already-applied state (detect and skip honestly).
- **The chatbot problem:** Naukri's apply flow frequently opens a Q&A chatbot
  (notice period, CTC, location). V1 policy: answer ONLY questions that map 1:1 to
  ApplicationProfile fields via the J4-b label-pattern engine; ANY unmapped question →
  stop, speak the question, let the owner answer by voice, fill verbatim, continue.
  Never fabricate an answer on a job application.
- **Submit:** confirm-gated verbatim (G-5), submission-verify + honest-ambiguous path,
  applied-status POST gated on `verification.success` — note the JC-1 finding (the
  LinkedIn version currently POSTs unconditionally; do NOT copy that bug into the Naukri
  port, and fixing JC-1 first is cheap since it's already queued as item 2).

## Explicitly rejected
- **Storing Naukri credentials / auto-login:** sessions stay in Chrome profiles; Krishna
  never sees passwords. Login expired → say so, owner logs in manually.
- **Auto-apply without per-job confirm (his "auto apply" phrasing):** J4-c's verbatim
  confirm gate is a deliberate safety property; batch/unattended apply stays parked with
  J5. One spoken confirm per submission.
- **Puppeteer/Playwright sidecar for the profile juggling:** the in-app CDP client (J4-a)
  already exists; a second automation stack would double the maintenance surface.
- **Static app-aliases entries for the search URLs:** aliases are code-config, owner can't
  edit them at runtime; saved searches are user data → DB + Settings UI.

## Acceptance (owner, live)
1. Settings → Job Searches → add "PM Mumbai belt" with the real PM URL, profile "PM",
   mode manual. "Krishna, open my program manager search" → normal Chrome opens a window
   in the PM profile, already logged into the right Naukri account, on the search results.
2. Same for Director + Scrum Master profiles → three searches, three profiles, no
   cross-contamination (each opens in its own profile).
3. Saved-search URL edited to a non-Naukri/LinkedIn host → rejected at save with a clear
   message.
4. (N4, later) "Apply to the next one" on a Naukri search in assisted mode → correct
   profile verified, Apply clicked, chatbot Qs either filled from profile or asked back by
   voice, verbatim confirm before submit, honest report after — and the applied-status
   POST only fires on verified success.
