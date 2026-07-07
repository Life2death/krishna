# RESUME HERE — Krishna handoff (updated 2026-07-07)

> **This is the single source of truth to resume from.** Reviewer (Claude), coding agent, and
> owner (Vikram) all sync through this file. Read the whole thing before touching anything.
> Deeper per-track detail lives in the `*_REVIEW_FINDINGS.md` and `*_PLAN.md` files referenced below.

---

## 1. STATUS IN ONE PARAGRAPH

`main` is **GREEN** — `tsc --noEmit` clean, `vitest run` 700/700, `cargo test` (automation module)
17/17, all reverified 2026-07-07. The **entire job-autopilot track (items 1–4 of the plan) is
code-complete and merged**: J1 (voice-open pipeline), J2 (queue read), J3 (profile store) + J3-A
(native resume file picker), and the full **J4 assisted-apply pipeline** (J4-a open+Easy-Apply,
J4-b auto-fill from profile, J4-c confirm-gated submit). Both owner gates (G-13 Gmail, H1
job-hunter token) are cleared and live-verified. Item 9 (travel insights, P1–P4), item 13
(recruiter radar + all RR/G follow-ups), and item 11 (Natural Speech V1–V4) are also fully
complete. **NEW since last update: Window Control (item 14) is now FULLY COMPLETE + merged** — all
3 phases (Win32 enumeration + pure matcher, Tauri commands, LLM tool + voice wiring) plus a
same-day review-fix commit (real next-monitor cycling, honest maximize-default), see §3a. This
was the queue's #1 item as of 2026-07-06 and is now done — **not yet live-tested by the owner**
(see §2). **Next: owner live-verifies Window Control**, then pick from the queue in §4 (Naukri
saved searches is now the top unblocked coding item).

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
1. **Naukri saved searches + Chrome profiles** — `NAUKRI_SEARCH_PROFILES_PLAN.md`
   (design-complete, 2026-07-06): N1 store → N2 Settings UI + profile picker → N3 launch/voice
   tool (all unblocked); N4 = the profile-aware J4b-Naukri assisted apply (blocked on D4 owner
   decision, see queue item 3). **Now the top unblocked coding item** (Window Control, formerly
   #4 here, is done — see §3a).
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
5. **Live transcript panel** — `LIVE_TRANSCRIPT_PANEL_PLAN.md` (design-complete, 2026-07-07):
   real-time panel showing the current utterance + Krishna's reply **streaming token-by-token** +
   live status. Owner asked for it (2026-07-07) after expecting the ▦ Dashboard icon to be live.
   Core hook already exists (the reply is streamed at `krishna.context.tsx:1866-1891` but the
   deltas are only accumulated, never surfaced). v1 = inline panel reading `useKrishna()` (D1
   recommends inline over a separate window); live word-by-word STT is explicitly out of v1
   (needs a streaming STT provider). One owner decision (D1 inline vs window, D2 toggle default).
6. **Settings menu reorg** — spec approved (`SETTINGS_REORG_PLAN.md`), P1–P3 ready to code.
7. **Item 6 · Network resilience P1** — `NETWORK_RESILIENCE_PLAN.md`.

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

## 7. NEXT AGENT INSTRUCTION (paste this to resume) — updated 2026-07-07 (evening)

> **Do these in order. Do not skip ahead to Naukri — there is uncommitted work on top of `main`
> that must land first.**

### Step 0 — read, in this order
1. `RESUME_HERE.md` (this file) in full — current status, open issues, the how-we-work rules (§6).
2. §3a below (Window Control) — what broke on the *first* owner live test and why, before touching
   any of those files.
3. Only once you're committing Step 1 below: skim the diff yourself first (`git diff` in
   `D:\Learning\krishna`) rather than re-deriving the fix from prose — the prose is a summary, the
   diff is the truth.
4. `NAUKRI_SEARCH_PROFILES_PLAN.md` — but only after Steps 1–2 are committed and confirmed green.
   Don't read it first and start coding N1 before the window-control fix is safely on `main`.

### Step 1 — commit the uncommitted window-control fix (do this FIRST, nothing else)
`main` at `D:\Learning\krishna` currently has **uncommitted changes on top of `3296a84`** — the
reviewer (Claude) diagnosed and fixed a real bug live with the owner tonight (2026-07-07): the
Phase 3 "voice wiring" claimed done in §3a was never actually reachable from a live conversation.
Full root-cause + fix description is in §3a. Files touched (verify with `git status`/`git diff` in
`D:\Learning\krishna`, don't trust this list going stale):
`packages/core/tools/index.ts`, `src/types/assistant.ts`, `src/lib/actions.ts`,
`src/contexts/krishna.context.tsx`, `src-tauri/src/automation.rs`, plus new/updated tests in
`src/__tests__/actions.test.ts` and `src/__tests__/window-control.test.ts`.
- **Your job:** in `krishna-m15`, branch fresh off `main` (`git checkout -b fix/window-control-wiring main`
  — main already has the uncommitted diff physically in the files at `D:\Learning\krishna`; coordinate
  with the reviewer on how that diff reaches your worktree, since it's sitting uncommitted in the
  *other* checkout — don't just re-implement it blind from the prose above).
  Re-run and confirm green yourself: `tsc --noEmit`, `vitest run` (expect the new registry +
  action-wiring tests to pass), `cargo test` (automation module, expect 17/17 including the
  rewritten `focus_hwnd`).
- Commit as **one commit** (this is a bundled bugfix already reviewed live, not a multi-phase build)
  with a message describing the three real defects fixed (see §3a) — then STOP and report. Reviewer
  merges to `main` after confirming the owner's live retest passed.
- **Do NOT start Naukri or the live-transcript panel until this is committed and the owner has
  confirmed "bring Teams to the front" actually works live.**

### Step 2 — after Step 1 is merged and owner-confirmed: pick ONE of these two
Both are design-complete and unblocked; ask the owner which to prioritize, or default to Naukri
(it's been queued longer).

**2a. Naukri saved searches + Chrome profiles** (`NAUKRI_SEARCH_PROFILES_PLAN.md`) — phases N1–N3
only (N4 is blocked on the D4 owner decision — do not start it):
- **N1** — saved-search store (schema/migration, LF-normalized per §6).
- **N2** — Settings UI + Chrome-profile picker.
- **N3** — launch + voice tool, wired the same way existing tools are exposed.

**2b. Live transcript panel** (`LIVE_TRANSCRIPT_PANEL_PLAN.md`, new 2026-07-07) — real-time panel
showing the current utterance + Krishna's reply streaming token-by-token + live status; owner asked
for it after expecting the ▦ Dashboard icon to be live. Read the whole plan first — it already
resolves the inline-vs-window question (recommends inline) and scopes out live word-by-word STT.
Phases: P1 surface `streamingReply` in `krishna.context.tsx` (+ fence-stripping helper, with tests)
→ P2 `LiveTranscript.tsx` → P3 bar toggle + `resizeWindow`.

> **A caution baked into this queue, from tonight's incident:** the previous Window Control session
> reported "done" on green `tsc`/`vitest`/`cargo test`, but the feature was completely unreachable
> in the live app because the tests drove the tool object directly instead of the real
> registry-lookup and action-dispatch seams the app actually uses. Before reporting either 2a or 2b
> done, ask yourself: *does at least one test call the function the live app actually calls* (the
> registered tool via `getTool()`, the parsed action via `executeAction()` — not the tool export
> imported directly)? If not, add one before reporting done.

### Process, non-negotiable (from prior rounds of review — do not repeat these)
1. ONE phase per commit (Step 1 is the exception — it's one already-reviewed bugfix), `tsc --noEmit`
   + `vitest run` (and `cargo test` if the phase touches Rust) all green, STOP and report after each.
2. **Actually run the checks before reporting done.** Don't claim a tool/environment failure without
   first reproducing it.
3. **Every spoken reply must describe something that actually works.** Trace claimed success to the
   real implementation and the real integration seam (see the caution above) — don't assume a call
   succeeded just because it didn't throw, and don't assume a tool is reachable just because its
   isolated unit test passes.
4. New external host (if any) → allowlist + CSP in the **same commit** (§6 — hit 3 times already:
   T1-F4, G-15, J2-C).
5. If a phase adds a dependency, commit `package.json`/`Cargo.toml` + lockfile together and
   coordinate before anyone else installs/builds (§6 node_modules rule).
