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

Still open: **VID-1** (model re-downloads every reload) and **VID-2** (meter stuck at 5, needs one
more data point) — see §5. Non-blocking for everything else.

**Earlier (pre-2026-07-05):** item 1 (travel error visibility, `4b9c997`), item 2 (no-narrated-
actions, `3b85777`), item 10-H1 (job-hunter bearer-token auth, deployed + live-verified).

---

## 4. PENDING QUEUE — priority order

### 🟢 Unblocked, ready to pick
1. **J3-A test** (small) — the Browse-button/file-picker wiring has no unit test yet. Mock
   `@tauri-apps/plugin-dialog`'s `open()`, assert it writes `resumePath`.
2. **JC-1** (medium, `JOB_AUTOPILOT_REVIEW_FINDINGS.md`) — the "applied" status POST in
   `job_apply_submit` fires unconditionally; should gate on `verification.success` so an ambiguous
   submit doesn't falsely remove the job from the not-applied queue.
3. **J4b-Naukri** — repeat the J4-a/b/c pattern for Naukri once LinkedIn has been live-used for a
   while (plan explicitly sequences this after LinkedIn proves out).
4. **Settings menu reorg** — spec approved (`SETTINGS_REORG_PLAN.md`), P1–P3 ready to code.
5. **Item 11 · Natural speech V1** — `NATURAL_SPEECH_PLAN.md`, branch `feat/natural-speech`.
6. **Item 6 · Network resilience P1** — `NETWORK_RESILIENCE_PLAN.md`.

### 🎨 Design-first (owner+reviewer specs exist; agent codes only after go-ahead)
- Settings menu reorg (see #4 above).
- Orb (presence indicator) — small orb + state animations; spec only.
- Android roadmap — consolidate parked Android tracks into one phased plan.

### ⚪ Parked (don't start unless asked)
M1.5 broad-question brevity, P6-F4 TTS-too-fast repro, Ola second-opinion tool, publish draft
releases.

---

## 5. OPEN ISSUES (non-blocking, tracked)

**VID-1 · WavLM model re-downloads every app load.** Every speech event re-triggers
`from_pretrained` fetching the model from Hugging Face (`embedding.ts`); a `Ctrl+R` reload restarts
the slow (no content-length) download mid-flight, so `verifyVoice` often never completes and
passive-fill stalls. `env.useBrowserCache=true` isn't persisting across reloads in the dev WebView.
**Fix options:** (a) check if a PRODUCTION build persists the cache — cheapest; (b) bundle the
model + serve via a Tauri asset/custom protocol; (c) persist to a Tauri-controlled cacheDir.
Workaround meanwhile: after launch, let the model finish loading once (no reload) before relying
on voice-ID.

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

## 7. NEXT AGENT INSTRUCTION (paste this to resume)

> Read `RESUME_HERE.md` in full first. `main` is green and the full job-autopilot + travel-insights
> + recruiter-radar tracks are complete. Pick the next item from §4 (recommended: J3-A test, then
> JC-1, then whichever of settings-reorg/natural-speech/network the owner prefers). Branch fresh off
> `main`. ONE phase per commit, `tsc --noEmit` clean + full `vitest run` green, **actually run `git
> commit`**, STOP and report. If your phase adds a new npm/cargo dependency, commit the lockfile
> together with it and do NOT run `npm install`/`cargo build` while the reviewer might be building
> from `main` at the same time — confirm with the owner first (see §6 node_modules rule).
