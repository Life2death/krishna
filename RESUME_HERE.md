# RESUME HERE — Krishna handoff (updated 2026-07-07)

> **This is the single source of truth to resume from.** Reviewer (Claude), coding agent, and
> owner (Vikram) all sync through this file. Read the whole thing before touching anything.
> Deeper per-track detail lives in the `*_REVIEW_FINDINGS.md` and `*_PLAN.md` files referenced below.

---

## 1. STATUS IN ONE PARAGRAPH

`main` is **GREEN** — `tsc --noEmit` clean, `vitest run` 731/731, `cargo test` compiles clean, all
independently reverified 2026-07-07 night. The **entire job-autopilot track (items 1–4 of the
plan) is code-complete and merged**: J1 (voice-open pipeline), J2 (queue read), J3 (profile store)
+ J3-A (native resume file picker), and the full **J4 assisted-apply pipeline** (J4-a
open+Easy-Apply, J4-b auto-fill from profile, J4-c confirm-gated submit). Both owner gates (G-13
Gmail, H1 job-hunter token) are cleared and live-verified. Item 9 (travel insights, P1–P4), item 13
(recruiter radar + all RR/G follow-ups), and item 11 (Natural Speech V1–V4) are also fully
complete. **Window Control (item 14)** shipped, **failed its first live test** (a real wiring gap —
see §3a), was diagnosed and fixed same-day, and is now merged (`22c6168`) — **awaiting owner
retest**. **Naukri saved searches N1–N3 (`NAUKRI_SEARCH_PROFILES_PLAN.md`) is also now DONE +
merged** (`669c6ce`) — awaiting owner live-test of the Settings UI + voice command. Mid-review, a
`.git` config corruption (`core.bare=true`, likely from concurrent git operations across
worktrees) briefly blocked all git commands in both `main` and `krishna-m15` — diagnosed and fixed
(§6). **Owner has explicitly reordered the queue tonight: first-word latency
(`LATENCY_FIRST_WORD_PLAN.md`) is now the top priority, ahead of the live-transcript panel** (both
touch the same stream loop — sequenced deliberately, see §4 item 5 and §7).

---

## 2. OWNER ACTION ITEMS — what's still on you

1. **Live-verify Window Control** (new, 2026-07-06/07 build — see §3a): with two monitors
   connected, say "move Chrome to the other monitor" → confirm it physically moves and comes to
   front, maximized state preserved. Say "bring File Explorer to the front" while Krishna is
   focused → confirm it raises reliably (the foreground-lock case). Try a query that doesn't match
   anything open → confirm you get a spoken "I can see X, Y, Z — which one?" instead of a crash.
   Toggle Computer Control OFF → confirm window commands refuse with the existing settings-path
   error. This is the thing unit tests can't prove (Rust/TS tests are green, see §3a).
2. **Live-verify the full J4 assisted-apply flow** against real LinkedIn: say "apply to the next
   job" → confirm it opens the job + clicks Easy Apply → confirm fields fill from your Application
   Profile → confirm the "shall I send it, sir?" prompt appears → say yes → confirm it submits (or
   reports ambiguous honestly). This is the thing unit tests can't prove.
3. **Debug Chrome for J4** must be running with all 3 flags before each session (it does NOT
   survive a machine restart):
   `chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\chrome-krishna" --remote-allow-origins=*`
   Verify: `http://localhost:9222/json/version` returns JSON with a `webSocketDebuggerUrl`. Stay
   logged into LinkedIn in that Chrome instance (no passwords stored in the app, by design).
4. **Try the new Resume Path Browse button** (Settings → Application Profile) — confirm the native
   picker opens and a missing/renamed file shows the inline warning (J3-A).
5. **Voice ID meter stuck at 5 samples** — still unresolved, see §5 VID-2. Needs one console
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

### Window Control (item 14) — built, FAILED first live test, wiring fixed + MERGED (`22c6168`, 2026-07-07 evening); owner retest pending
| Phase | What | Commit |
|---|---|---|
| P1 | Win32 window/monitor enumeration + pure `match_window()` matcher (exact > substring > process-alias > exe-stem fallback); 11 unit tests | `0b171c8` |
| P2 | Tauri commands replace the `computer_focus_window` stub: focus (restore+Alt-nudge+foreground), `window_move` (restore-if-maximized → move → re-maximize → focus), `window_list_summary`; all gated on Computer Control toggle | `32b3da1` |
| P3 | `control_window` LLM tool (`action: focus\|move`, `target`, `monitor?`) + system prompt rule #11; 8 new tests | `47fe8c4` |
| Fix | `parse_monitor("next", …)` hardcoded to index 1 (panic on single monitor, never cycled on 3+) → now computes the window's actual current monitor and cycles; `window_move` maximize default was unconditional `true` → now the window's actual state. 6 new tests | `3296a84` |

**⚠️ FIRST LIVE TEST FAILED (2026-07-07) — three defects the unit tests missed, all fixed the same day (committed `175781c` on `fix/window-control-wiring`, merged to `main` as `22c6168`):**
1. **`control_window` was never registered in the tool map** — imported into `packages/core/tools/index.ts` but no `register()` call, so `getTool()` returned undefined. Fixed: added the 6 `register(...)` calls for all `computer_*`/`control_window` tools.
2. **`control_window` was never wired into the `action` dispatch path** (the real root cause). Phase 3 only added a plan-executor `Tool` + a vague prompt rule; `parseActions()` and `executeAction()` had no `control_window` case, so the LLM's `{"action":"control_window",…}` block was silently dropped and Krishna spoke a **fabricated** "Teams should be front and centre now" with no tool behind it (audit_log had zero `control_window` rows across every attempt — proof it never ran). Fixed: added the `Action` type, a `parseActions` case, a non-confirm-gated `executeAction` handler (`kind:"status"`, speaks the tool's real output/error), and a concrete `WINDOW CONTROL` prompt example. New tests in `actions.test.ts` + `window-control.test.ts` drive the real parse→execute and registry seams.
3. **`focus_hwnd` reported success unconditionally + used the weak Alt-nudge.** It ignored `SetForegroundWindow`'s return (always `Ok`) and relied on a bare Alt keypress, which a background app can't use to reliably lift the foreground lock. Fixed: `AttachThreadInput`-based activation (attach to the foreground+target threads, `BringWindowToTop` + `SetForegroundWindow`, detach) with `IsIconic` restore, and it now **verifies against `GetForegroundWindow`** and returns a real error if the window didn't actually come forward.

**Lesson (again):** the P3 tests called `controlWindowTool.run()` directly, bypassing both the registry (`getTool`) and the action pipeline (`parseActions`→`executeAction`) — exactly the "test the real integration seam, not the object in isolation" gap in §6. A tool that isn't reachable from the LLM's actual output format is not "done" no matter how green its isolated tests are.

**Status after fix:** `tsc` clean, `vitest run` green (new tests added), `cargo test` automation module green. TS layer is HMR-live in the running dev app; Rust layer needs the running app rebuilt to take effect. **Still owner-live-pending** (see §2 item 1) and **uncommitted** — the coding agent should commit both layers (branch off `main`).

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
1. **Naukri saved searches + Chrome profiles — N1–N3 DONE + merged (`669c6ce`, 2026-07-07
   evening).** `saved_searches` table (migration v21) + CRUD + hostname-validated URL guard,
   Settings UI + Chrome-profile picker (`list_chrome_profiles`), `open_saved_search` voice action
   (exact→fuzzy→disambiguate) + `open_in_chrome_profile`. `tsc` clean, `vitest` 731/731, `cargo
   test` compiles clean — independently reverified before merge. One review round: a rebase
   conflict left the `Action` type union malformed (orphaned `open_saved_search` member) — caught
   by `tsc`, NOT by `vitest` (esbuild strips types without checking them — always run both).
   **Non-blocking follow-ups filed** (see `chrome_profiles.rs`): hardcoded `chrome.exe` path should
   read `%LOCALAPPDATA%`; `open_in_chrome_profile`'s URL check is a weak prefix match (N1's
   store-side `hostname` parse is the real gate, so low risk); macOS/Linux
   `get_default_user_data_dir` has a latent `Option<Option<>>` mismatch (dead code on Windows).
   **N4** (profile-aware J4b-Naukri assisted apply) still blocked on the D4 owner decision — not
   started. **Not yet owner-live-tested.**
2. **J3-A test** (small) — the Browse-button/file-picker wiring has no unit test yet. Mock
   `@tauri-apps/plugin-dialog`'s `open()`, assert it writes `resumePath`.
3. **JC-1** (medium, `JOB_AUTOPILOT_REVIEW_FINDINGS.md`) — the "applied" status POST in
   `job_apply_submit` fires unconditionally; should gate on `verification.success` so an ambiguous
   submit doesn't falsely remove the job from the not-applied queue. Fix before porting to Naukri
   (N4) so the bug isn't copied in.
4. **J4b-Naukri** — now spec'd as phase N4 of `NAUKRI_SEARCH_PROFILES_PLAN.md` (2026-07-06),
   profile-aware; still sequenced after LinkedIn proves out, and blocked on the D4 owner
   decision in that plan (one shared ApplicationProfile + per-search resume override vs
   per-role profiles).
5. **🔴 TOP PRIORITY (owner decision, 2026-07-07 evening) · First-word latency** —
   `LATENCY_FIRST_WORD_PLAN.md` (design-complete): "I want Krishna to speak the 1st word ASAP."
   Measured 10-35s end-of-speech→first-audio on the dev latency panel. Root cause: 3 full-completion
   waits in series (full LLM generation before any speech; full TTS synthesis+download before
   playback starts; a silent window during STT with no earcon/filler). L1 = sentence-streaming
   speech (speak sentence 1 while generation continues) — the big win, build this first. **This
   branch must merge BEFORE the live-transcript panel below** (both touch the same
   `krishna.context.tsx` stream loop; L1 builds the fence-aware sentence splitter that
   live-transcript will then reuse instead of duplicating). See the plan's own sequencing note.
6. **Live transcript panel** — `LIVE_TRANSCRIPT_PANEL_PLAN.md` (design-complete, 2026-07-07;
   **updated to sequence after item 5**): real-time panel showing the current utterance +
   Krishna's reply **streaming token-by-token** + live status. Owner asked for it (2026-07-07)
   after expecting the ▦ Dashboard icon to be live. v1 = inline panel reading `useKrishna()` (D1
   recommends inline over a separate window); live word-by-word STT is explicitly out of v1 (needs
   a streaming STT provider). One owner decision remains (D2 toggle default) — D1 is settled.
   **Do not start until item 5 is merged** — re-read Phase 1 in the plan file at that point, it
   changes once L1 exists.
7. **Settings menu reorg** — spec approved (`SETTINGS_REORG_PLAN.md`), P1–P3 ready to code.
8. **Item 6 · Network resilience P1** — `NETWORK_RESILIENCE_PLAN.md`.

_(Item 11 · Natural Speech V1–V4 is now FULLY DONE + merged to main `52d5dfa` — see §3.)_

_(VID-1 model-bundle is now DONE + merged to main `236cba8` — see §5.)_

_(Item 14 · Window Control is now FULLY DONE + merged to main `3296a84` — see §3a. Not yet
owner-live-tested, see §2 item 1.)_

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
`[voice-id] verify: score=… threshold=… match=…` console line. (The fetch script's SHA-gate-skip
follow-up is DONE — merged `4e0ac79`, see §3 Voice ID table — no code follow-up remains here.)

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

- **🔴 `core.bare` corruption incident (new, 2026-07-07 evening):** mid-review of the naukri merge,
  `D:\Learning\krishna`'s `.git\config` was found with `core.bare = true` (plus a self-referential
  `remote "main-checkout"` pointing at its own path) — every git command failed with "this
  operation must be run in a work tree", in BOTH the main checkout and `krishna-m15` (worktrees
  share the parent's `core.*` config). Nobody ran this deliberately; likely a race between two
  processes touching shared worktree metadata concurrently (same family of issue as the
  [[one-party-npm-install-rule]] node_modules incident, this time hitting `.git` plumbing instead).
  **Fix:** `git config core.bare false` in `D:\Learning\krishna` (the actual `.git`, shared by all
  worktrees — fixing it there fixes every worktree at once). **If you ever see "must be run in a
  work tree" from a command that should obviously work, check `git config --get core.bare` before
  assuming something else is broken.**

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

## 7. NEXT AGENT INSTRUCTION (paste this to resume) — updated 2026-07-07 (night)

> Read `RESUME_HERE.md` in full first, then `LATENCY_FIRST_WORD_PLAN.md` (the full spec — read
> before writing any code). `main` is green at `e14c10d`+ the two merges below —
> `tsc --noEmit` clean, `vitest run` 731/731, `cargo test` compiles clean, all independently
> reverified. Window Control (§3a) and Naukri N1-N3 (§4 item 1) are **DONE + MERGED** — do not
> touch those files except via the follow-ups explicitly listed in §4. `feat/live-transcript`
> (P1-P3) is **UNMERGED and stale** — do not touch it yet, see below for when.

### Do this now: `LATENCY_FIRST_WORD_PLAN.md` (owner's explicit top priority, reordered ahead of the transcript panel tonight)
Branch fresh off local `main` (`git checkout -b feat/first-word-latency main` — **never
`origin/main`**, it is stale relative to local `main`; **never `git push`**, any branch, ever —
three branches were pushed in error earlier tonight, treat this as a zero-exception rule now).
Build phases in order, per the plan: **L1** sentence-streaming speech (the big win — speak the
first sentence while generation continues; new fence-aware splitter in
`src/lib/sentence-stream.ts` + a `SpeechQueue`) → **L2** ElevenLabs streaming endpoint → **L3**
end-of-speech earcon + earlier filler → **L4** STT watchdog+retry → **L5** latency-panel column
label fix. Read the plan's full root-cause section (three full-completion waits in series) before
touching `krishna.context.tsx` — don't reconstruct it from this summary.

**Only after this branch merges:** rebuild `feat/live-transcript` from scratch off the new `main`
(`LIVE_TRANSCRIPT_PANEL_PLAN.md` — its Phase 1 has an updated note for once L1 exists: reuse L1's
sentence/fence utilities instead of writing a second fence parser). Do not start it before then —
both plans touch the same stream loop in series specifically to avoid two branches on one seam.

### The lesson driving every check below (from tonight, twice)
1. **A tool "passing its own unit tests" is not the same as "reachable from the live app."**
   Window Control's Phase 3 shipped with green `tsc`/`vitest`/`cargo test` but was completely
   unreachable — the tests called the tool object directly, never the registry (`getTool()`) or
   the action dispatch (`parseActions`/`executeAction`) the live app actually uses. Before
   reporting any phase done: does at least one test drive the real seam, not a reimplementation?
2. **`vitest` passing does not mean `tsc` passes.** The naukri rebase left the `Action` type union
   syntactically broken (an orphaned member after a stray semicolon) — `vitest` (esbuild, strips
   types) reported 731/731 green on code that didn't typecheck. Both checks, every commit, no
   exceptions — and if you see a `.git` "must be run in a work tree" error from an obviously-fine
   command, check `git config --get core.bare` before assuming something else broke (see §4 item 5
   in `AGENT_NEXT_TASKS.md` — this hit both worktrees tonight from a race between concurrent git
   operations, now fixed).

### Process, non-negotiable (from prior rounds of review — do not repeat these)
1. ONE phase per commit, `tsc --noEmit` + `vitest run` (and `cargo test` if the phase touches Rust)
   all green, STOP and report after each — don't bundle phases.
2. **Actually run the checks before reporting done.** Don't claim a tool/environment failure
   without first reproducing it.
3. **Every spoken reply must describe something that actually works.** Trace claimed success to
   the real implementation and the real integration seam (see above) — don't assume a call
   succeeded just because it didn't throw, and don't assume a tool is reachable just because its
   isolated unit test passes.
4. New external host (if any) → allowlist + CSP in the **same commit** (§6 — hit 3 times already:
   T1-F4, G-15, J2-C).
5. If a phase adds a dependency, commit `package.json`/`Cargo.toml` + lockfile together and
   coordinate before anyone else installs/builds (§6 node_modules rule).
