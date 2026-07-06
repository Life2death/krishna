# RESUME HERE — Krishna handoff (updated 2026-07-06)

> **This is the single source of truth to resume from.** Reviewer (Claude), coding agent, and
> owner (Vikram) all sync through this file. Read the whole thing before touching anything.
> Deeper per-track detail lives in the `*_REVIEW_FINDINGS.md` and `*_PLAN.md` files referenced below.

---

## 1. STATUS IN ONE PARAGRAPH

`main` is **GREEN and running live** (`npm run tauri dev`, app confirmed up as a real process).
The **entire job-autopilot track (items 1–4 of the plan) is code-complete and merged**: J1
(voice-open pipeline), J2 (queue read), J3 (profile store) + J3-A (native resume file picker), and
the full **J4 assisted-apply pipeline** (J4-a open+Easy-Apply, J4-b auto-fill from profile, J4-c
confirm-gated submit). Both owner gates (G-13 Gmail, H1 job-hunter token) are cleared and
live-verified. Item 9 (travel insights, P1–P4) and item 13 (recruiter radar + all RR/G follow-ups)
are also fully complete. **Tonight's incident:** a concurrent `npm install` corrupted
`node_modules` — repaired (`rm -rf node_modules && npm ci`), lockfiles (`package-lock.json` +
`Cargo.lock`) reconciled and committed. **New standing rule: one party touches node_modules at a
time** (see §6). **Next: live-verify the full J4 flow end-to-end**, then pick from the queue in §4.

---

## 2. OWNER ACTION ITEMS — what's still on you

1. **Live-verify the full J4 assisted-apply flow** against real LinkedIn: say "apply to the next
   job" → confirm it opens the job + clicks Easy Apply → confirm fields fill from your Application
   Profile → confirm the "shall I send it, sir?" prompt appears → say yes → confirm it submits (or
   reports ambiguous honestly). This is the thing unit tests can't prove.
2. **Debug Chrome for J4** must be running with all 3 flags before each session (it does NOT
   survive a machine restart):
   `chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\chrome-krishna" --remote-allow-origins=*`
   Verify: `http://localhost:9222/json/version` returns JSON with a `webSocketDebuggerUrl`. Stay
   logged into LinkedIn in that Chrome instance (no passwords stored in the app, by design).
3. **Try the new Resume Path Browse button** (Settings → Application Profile) — confirm the native
   picker opens and a missing/renamed file shows the inline warning (J3-A, this session).
4. **Voice ID meter stuck at 5 samples** — still unresolved, see §5 VID-2. Needs one console
   capture to finish diagnosing; not urgent, does not block J4.

---

## 3. DONE + MERGED (2026-07-04 → 07-06) — everything currently on `main`

### Job Autopilot (item 10) — FULLY COMPLETE, LinkedIn Easy Apply
| Phase | What | Commit |
|---|---|---|
| J1 | Job Pipeline URL alias (voice-open) | `3500695` |
| J2 | `get_job_queue` tool — queue read, total+top-3-by-fit spoken, KNOWN_SAFE, live-verified vs real API | `c2bbe5f` |
| J3 | ApplicationProfile store (12 fields) — Settings UI, keyed memory row → SQLCipher | `e910938` |
| J3-A | Native resume-PDF file picker (`@tauri-apps/plugin-dialog`) + `file_exists` inline warning | `14e7438` → merged; lockfiles `f27b16c`, `6148d76` |
| J4-a | In-app CDP client (WebView `WebSocket` + `getHttpFetch`); `job_apply` opens next queued job, clicks **Easy Apply** (external plain Apply reported, not clicked) | `2ea06b5` |
| J4-b | Field-fill engine — enumerate → map to J3 profile by label pattern → fill via CDP → spoken summary; profile read from the memory DB store | `b579f43` |
| J4-c | `job_apply_submit` — sensitive/confirm-gated (G-5 verbatim-confirm), submit-button detect + submission verify, honest ambiguous path, applied-status POST | `ed1fd08` |

Full history incl. fixed review findings (JA-1/JA-2, JB-1, JC-1): `JOB_AUTOPILOT_REVIEW_FINDINGS.md`.
**Not yet built:** J4b-Naukri (LinkedIn-only for now, per plan), J5 batch semi-auto (parked).

### Gmail + Recruiter Radar (items 12–13) — FULLY COMPLETE, live-verified
| What | Commit |
|---|---|
| G-13 OAuth redirect_uri fix (token exchange was always failing) | `0d847f1` |
| G-15 — `gmail.googleapis.com` + job-hunter host missing from Tauri http allowlist/CSP (silent transport block) | `e525b60` |
| G-16/G-17 — spoken-output hygiene: sender name not raw email, drop raw msg-id, em-dash→comma, ISO date→natural | `40df3e7` |
| Recruiter Radar R1–R3 + RR-1/RR-3/RR-4 (state, windowing, JSON-fence robustness, flaky-test fix) | `f6f9719`, `63b9afb`, `0f2f342` |
| RR-2 — `category:primary` 0-results now a valid empty answer (no inbox sweep/prefix); fallback only on real error | `8de2db4` |

Full history: `GMAIL_REVIEW_FINDINGS.md`, `GMAIL_RECRUITER_RADAR_REVIEW_FINDINGS.md`.

### Travel Insights (item 9) — FULLY COMPLETE, live-verified
| Phase | What | Commit |
|---|---|---|
| P1 | `sampleDepartures()` — sequential, cap 8, per-sample failure capture | `8dda179` |
| P2 | `suggest_departure_time` tool + `travel_best` action — **live-verified** ("leaving now is 42 min, wait to 3:33pm drops to 35") | `a6e5d89` |
| P3 | `route_watches` migration + arm/cancel, single-active-watch | `e6589b7` |
| P4 | Poller: trigger on duration ≤ threshold (fixed from inverted), 15-min interval gate (fixed from 30s-every-tick), expiry speaks close-out (fixed from silent) | `f7332a5` + `aced906` |

Full history: `TRAVEL_INSIGHTS_REVIEW_FINDINGS.md`.

### Voice ID (item 7) — enrollment + passive-fill working; one open issue remains (§5)
| What | Commit |
|---|---|
| Option-A passive background-fill (verify always runs; fill even when Voice ID disabled) | `c38ecd1` |
| 3 live bugs fixed: ONNX single-thread required (Tauri has no `SharedArrayBuffer`), `addSample` missing `created_at` (NOT NULL crash), real-error surfacing | `04905c4`, `fa83f69` |
| Enable gate relaxed 100%→≥3 samples (owner decision) — **owner enrolled to 5 samples and enabled it live** | `540213c` |
| Passive-fill bootstrap gate fix (add-gate was stricter than match threshold, deadlocking growth) | `59e8d6d` |

**VID-1 is DONE** (bundled model + SHA-gate, see §5). Still open: **VID-2** (meter stuck at 5,
needs one live data point) — non-blocking for everything else.

**Earlier (pre-2026-07-05):** item 1 (travel error visibility, `4b9c997`), item 2 (no-narrated-
actions, `3b85777`), item 10-H1 (job-hunter bearer-token auth, deployed + live-verified).

### Natural Speech (item 11) — FULLY COMPLETE, V1–V4 all merged
| Phase | What | Commit |
|---|---|---|
| V1 | Variety engine: `pickLine()` anti-repeat + TOD boost + mr→hi→en fallback + {honorific} slots, ~140 seed lines × 12 categories × en/hi/mr; wired into `canned-responses.ts` (async) + 9 spoken literals in `krishna.context.tsx` | `fee4e61` |
| V2 | LLM-side prompt variety: 5 style examples + "never reuse your previous acknowledgment" instruction in `BASE_SYSTEM_PROMPT` + `seed-personas.ts`; last-3-acks from `speech_log` injected into context as a concrete anti-repeat signal | `875d7a4` |
| V3 | `speech_ban` / `speech_teach` voice actions; Settings "Voice & Phrases" page (toggle/delete/view) | `c508e18` |
| V4 | `speech_refresh` — LLM mines the owner's own conversation history into proposed new lines (`enabled:false`, source `llm`) with quality filters (banned/dup/honorific-slot/length) | `11df913` |
| Fix | Reviewer fixes: `speech_ban` now persists the raw phrase in a new `banned_phrases` table even when it doesn't match a seeded/taught line (was silently a no-op in the common case); real `speech_accept_vocabulary` voice action added (the spoken "say 'accept them'" promise was previously a dead end — nothing implemented it); honorific-slot validation tightened (was accepting hardcoded "sir"/"boss" instead of the `{honorific}` template, risking a permanently-wrong-honorific approved line); 14 new tests covering V4's previously-untested quality filters and the ban/accept fixes | `52d5dfa` |

This is the "learn from me + varied greeting words" feature the owner asked about (2026-07-06) —
fully built end to end. Full history/spec: `NATURAL_SPEECH_PLAN.md`.

---

## 4. PENDING QUEUE — priority order

### 🟢 Unblocked, ready to pick
1. **J3-A test** (small) — the Browse-button/file-picker wiring has no unit test yet. Mock
   `@tauri-apps/plugin-dialog`'s `open()`, assert it writes `resumePath`.
2. **JC-1** (medium, `JOB_AUTOPILOT_REVIEW_FINDINGS.md`) — the "applied" status POST in
   `job_apply_submit` fires unconditionally; should gate on `verification.success` so an ambiguous
   submit doesn't falsely remove the job from the not-applied queue.
3. **J4b-Naukri** — now spec'd as phase N4 of `NAUKRI_SEARCH_PROFILES_PLAN.md` (2026-07-06),
   profile-aware; still sequenced after LinkedIn proves out, and blocked on the D4 owner
   decision in that plan (one shared ApplicationProfile + per-search resume override vs
   per-role profiles). Phases N1–N3 (saved searches + Chrome-profile launch) are unblocked.
4. **Window control** — `WINDOW_CONTROL_PLAN.md` (design-complete, 2026-07-06): move/focus other
   apps' windows across monitors by voice; Win32 via `windows` crate, extends `automation.rs`,
   replaces the `computer_focus_window` stub. Windows-only v1.
5. **Naukri saved searches + Chrome profiles** — `NAUKRI_SEARCH_PROFILES_PLAN.md`
   (design-complete, 2026-07-06): N1 store → N2 Settings UI + profile picker → N3 launch/voice
   tool (all unblocked); N4 = the profile-aware J4b-Naukri assisted apply (blocked on D4 owner
   decision, see queue item 3).
6. **Settings menu reorg** — spec approved (`SETTINGS_REORG_PLAN.md`), P1–P3 ready to code.
7. **Item 6 · Network resilience P1** — `NETWORK_RESILIENCE_PLAN.md`.

_(Item 11 · Natural Speech V1–V4 is now FULLY DONE + merged to main `52d5dfa` — see §3.)_

_(VID-1 model-bundle is now DONE + merged to main `236cba8` — see §5.)_

### 🎨 Design-first (owner+reviewer specs exist; agent codes only after go-ahead)
- Settings menu reorg (see #4 above).
- Orb (presence indicator) — small orb + state animations; spec only.
- Android roadmap — consolidate parked Android tracks into one phased plan.

### ⚪ Parked (don't start unless asked)
M1.5 broad-question brevity, P6-F4 TTS-too-fast repro, Ola second-opinion tool, publish draft
releases.

---

## 5. OPEN ISSUES (non-blocking, tracked)

**VID-1 · DONE + merged to main (`236cba8`, 2026-07-06).** Was: WavLM model re-downloaded from
Hugging Face on every app load; a `Ctrl+R` mid-download lost progress so `verifyVoice` stalled.
Fix (per `VOICE_ID_MODEL_BUNDLE_PLAN.md`): model now bundled locally under `public/models/`
(gitignored, SHA-verified ~97 MiB, fetched build-time by `scripts/fetch-voiceid-model.ts`;
`predev`/`prebuild` run it automatically); `embedding.ts` sets `allowLocalModels=true` with a
remote fallback. **Verified by reviewer:** tsc clean, 658/658 tests green, full `tauri dev` built +
launched, Vite serves `/models/` as real bytes, **zero huggingface.co requests at startup**.
**One owner step left to fully close it (and unblock VID-2):** speak to Krishna once, confirm the
model loads fast with no re-download even after a `Ctrl+R`, and capture one
`[voice-id] verify: score=… threshold=… match=…` console line. Follow-up (not blocking): the fetch
script's skip-if-exists check runs before SHA verification — an interrupted partial download can be
skipped unverified; SHA should also gate the skip path (`scripts/fetch-voiceid-model.ts:141`).

**VID-2 · Voice ID meter stuck at 5 samples.** DB shows `count=5, mature=0, adaptive_threshold=
0.85, confidence=17%`. The bootstrap add-gate fix (`59e8d6d`) IS active (mature=0 → gate=0.85), so
that's not the blocker. Leading theory: natural conversational speech scores **below 0.85** against
only 5 deliberate enrollment samples → `match=false` in KrishnaVAD → `considerAddSample` never
called. **Blocked on VID-1** — need one clean (post-model-load, no-reload) console capture of
`[voice-id] verify: score=… threshold=… match=…` to confirm before fixing. Do not guess-fix a
biometric gate without that number.

**Sync "SqlDriver not set."** Background sync fails `SqlDriver not set - call setDriver() before
first DB access` even though `initializeCore` calls `setDriver` before `startSync`. Likely a
module-duplication issue (`@krishna/core/sync` resolving a different driver-module instance than
the app's `setDriver` call — vite-alias vs node_modules dual instance). Only breaks sync; main
app/voice/DB work fine. Low priority — fix when sync becomes a priority.

**RR-2 pre-flight probe result (for context, already resolved):** live-confirmed `category:primary`
IS honored on the account — that's why RR-2's fix (fallback only on real error) was the correct
one. See `GMAIL_RECRUITER_RADAR_REVIEW_FINDINGS.md` for the full trail.

---

## 6. HOW WE WORK (don't relearn this the hard way)

- **Roles:** Owner decides priorities, live-tests, holds keys/setup (Chrome debug flags, LinkedIn
  login). Agent writes ALL app code in the `D:\Learning\krishna-m15` worktree. Reviewer (Claude)
  plans/reviews/merges + writes docs from `D:\Learning\krishna` (main checkout).
  See [[review-not-fix-workflow]].
- **Branch model:** `main` is the single hub. Branch fresh off `main` per track
  (`git checkout -b <name> main` in `krishna-m15`); never `git checkout main` in that worktree.
  ONE branch per track — never stack two tracks on one branch (bit us once: recruiter R1 landed on
  the gmail-fix branch and had to be relocated).
- **Commit protocol:** ONE phase per commit → `npx tsc --noEmit` clean + full `npx vitest run`
  green → commit (**actually run `git commit`** — "done" that isn't committed doesn't count, this
  has happened) → STOP and report. Reviewer merges after approval.
- **🔴 node_modules / npm install rule (new, 2026-07-05 incident):** exactly ONE party touches
  `node_modules` at a time. A concurrent agent `npm install` + reviewer build corrupted the bin
  shims (`tauri` CLI became unresolvable) and took real time to diagnose and repair (`rm -rf
  node_modules && npm ci`, then reinstall + relink both `package-lock.json` and `Cargo.lock`).
  **When a phase adds a dependency:** agent installs it, commits `package.json` AND
  `package-lock.json` (and `Cargo.toml`/`Cargo.lock` for Rust deps) together, confirms done — ONLY
  THEN does the reviewer install/build. Never run installs/builds in parallel across the two
  checkouts.
- **NEVER `git push`** (feature branch OR main) — can trip the auto-release pipeline. Already
  violated once (`fix/gmail-latest-email` pushed to origin). See [[no-push-release-pipeline]].
- **Three gotchas:** (1) secrets go in `secureStorage`/`getSecret`, NOT Windows Credential Manager
  (a separate store the app can't read) — see [[secure-store-key-gotcha]]; personal data (e.g. the
  Application Profile) goes in the SQLCipher memory store, not localStorage (bit us once — J4-b's
  first pass read `localStorage` and found nothing). (2) Set `ExecuteActionResult.kind`
  ("answer"|"status") explicitly — don't prefix-sniff. (3) `command_log="answered"` ≠ data
  persisted — verify the actual table, not the spoken/logged outcome.
- **DB migrations must be LF-normalized** (CRLF breaks the tauri-plugin-sql checksum — T4-F5).
- **Test the real integration seam, not a reimplementation.** Recurring failure pattern this
  session (G-11, J2-B, TI-1, JA-1, JB-1): a test that hand-copies or reimplements logic instead of
  calling the real function passes even when the real function is broken (wrong CDP-response
  unwrap depth, wrong storage backend, inverted condition). When a tool crosses a real boundary
  (DB, CDP, HTTP), at least one test must drive the real function with a realistically-shaped mock
  of that boundary.
- **New external host → allowlist + CSP in the SAME commit** (T1-F4, G-15, J2-C all hit this).
  Unit tests mock `getHttpFetch` so a missing allowlist entry is invisible until a live run.

---

## 7. NEXT AGENT INSTRUCTION (paste this to resume) — updated 2026-07-06

> Read `RESUME_HERE.md` in full first, then `AGENT_NEXT_TASKS.md`. `main` is green at `52d5dfa`.
> VID-1 (+ SHA-gate) and **Natural Speech V1–V4 (the FULL plan) are now done and merged** —
> variety engine, LLM-prompt variety + anti-repeat, teach/ban voice actions + Settings UI, and
> vocabulary-refresh from the owner's own conversation history are all live. Do not re-open
> `NATURAL_SPEECH_PLAN.md` as a task — it's finished; see §3 for the full commit list. Your
> worktree (`krishna-m15`, branch `agent/next-off-main`) is reset to exactly `main`'s HEAD;
> node_modules is healthy (verified: `tsc --noEmit` and `vitest run` both work, 692 tests green).
>
> **Task: pick the next item from §4**, in order: (1) Window control — `WINDOW_CONTROL_PLAN.md`;
> (2) Naukri saved searches N1–N3 — `NAUKRI_SEARCH_PROFILES_PLAN.md` (N4 is blocked on an owner
> decision, see queue item 3 in §4); (3) JC-1 fix (small, `JOB_AUTOPILOT_REVIEW_FINDINGS.md`); (4)
> J3-A test (small). Confirm with the owner which to start if it's not obvious from context.
>
> **Process, non-negotiable (these were violated at least once each in earlier rounds — the last
> Natural Speech submission needed 4 real bug fixes in review before merge: a ban that silently
> no-op'd, a spoken promise for a voice command that didn't exist, a weak validation check, and
> zero tests for an entire phase):**
> 1. Branch fresh off `main` — do NOT continue on an old branch.
> 2. Import DB actions via the `@krishna/core/database` barrel (`import { x } from
>    "@krishna/core/database"`), NOT a deep path like `@krishna/core/database/whatever.action` —
>    the vite config only aliases specific deep paths and a bare deep import silently fails to
>    resolve in the real app even though it may typecheck in isolation.
> 3. New tests go in `src/__tests__/` (root vitest scope). Anything under `apps/**` is EXCLUDED by
>    `vite.config.ts`'s test include list and will silently never run.
> 4. Don't use a real `@libsql/client(":memory:")` in tests — its native binding hangs vitest's
>    worker threads. Use a hand-rolled in-memory fake driver matching the SQL your function
>    actually issues (see `src/__tests__/speech-v4-refresh.test.ts` for the pattern: one driver
>    that answers every real query — conversations/messages/voice_lines/banned_phrases — rather
>    than mocking the module surface with `vi.mock`/`importOriginal`, which proved unreliable
>    across multiple tests in one file when combined with `vi.resetModules()`).
> 5. **Actually run `tsc --noEmit` and `vitest run` before reporting a phase done.** If you hit a
>    real, reproducible tool failure, paste the exact error in your report; do not report "done"
>    with unverified/unrun checks, and do not claim "node_modules corruption" without first
>    verifying `node -e "require('lightningcss')"` actually throws.
> 6. **Every spoken reply must describe something that actually works.** If a response tells the
>    owner to say a phrase to trigger a capability, that capability must have a real parser entry,
>    action handler, and prompt instruction wired end-to-end — not just a plausible-sounding
>    sentence. Verify this by tracing the promised phrase through to an actual implementation
>    before considering the phase done.
> 7. Every DB write path (ban/teach/insert) needs to actually persist what it claims to, even in
>    the common no-match/empty case — a confirmation message is not itself evidence of persistence.
> 8. ONE phase per commit, STOP and report after each. If a phase adds a dependency, commit
>    `package.json` + `package-lock.json` together and confirm before anyone else installs/builds
>    (§6 node_modules rule).
