# RESUME HERE — Krishna handoff (updated 2026-07-05, day 2 — post live smoke test)

> **This is the single source of truth to resume from.** Reviewer (Claude), coding agent, and
> owner (Vikram) all sync through this file. Read the whole thing before touching anything.
> Deeper per-track detail lives in the `*_REVIEW_FINDINGS.md` and `*_PLAN.md` files referenced below.

---

## 1. STATUS IN ONE PARAGRAPH

`main` is **GREEN** and — new since last update — **LIVE-VERIFIED by the owner** on 2026-07-05:
the desktop app built and ran (`npm run tauri dev`, Rust side incl. the G-13 fix + migration v19
compiled clean), and the owner smoke-tested **items 12/13/14 + J1 all good**, including the
**G-13 Gmail Connect — ✓ Connected live.** (NOTE: only the OAuth Connect step was verified; actual Gmail API calls were still blocked by a missing http-scope allowlist — see G-15 below, now fixed.) **Both owner gates are now
CLEARED**: G-13 (Gmail) and H1 (job-hunter token, confirmed live — `GET /api/jobs` returns real
queue data with the bearer token). **RR-2 and item 10-J2 are both now unblocked.** Design specs
approved and written (settings reorg, mini orb, Android roadmap). **Item 7 voice-ID P3** (`c38ecd1`,
see §3 live caveat) **and item 10-J2 queue read** (`c2bbe5f`, live-verified against the real API)
are both now DONE + merged. **Next agent pick: RR-2** (recruiter fetch tuning — owner said do it
after J2); then settings reorg / item 9 / item 11.

---

## 2. OWNER ACTION ITEMS

1. **G-13 · Gmail Connect** — ✓ Connected (OAuth verified). **BUT Gmail API calls were still
   blocked** by a missing http-scope allowlist (G-15, fixed `e525b60`). **After the next rebuild,
   re-verify live:** "search my Gmail for from:<someone>" must return real messages (not a scope
   error), then recruiter radar.
2. ~~**H1 · Deploy the job-hunter API token**~~ — **DONE 2026-07-05, live-verified.** Merged
   `feat/krishna-api-token` → `master`, token generated, `KRISHNA_API_TOKEN` +
   `KRISHNA_API_USER_EMAIL=vikram.panmand@gmail.com` set in Render, deployed. Confirmed live:
   `GET /api/jobs?status=not_applied` with the bearer token returns real queue data (LinkedIn
   jobs, correctly scoped to the user). **Item 10-J2 is now UNBLOCKED.**
3. **J3 restart-persistence check (small):** Application Profile was filled+saved in-session;
   the definitive test (quit app → relaunch → fields persist) — do once in passing.

---

> **⚠️ G-15 / J2-C (fixed `e525b60`, needs rebuild + live re-verify):** `gmail.googleapis.com`
> and the job-hunter host were never in the Tauri http allowlist / CSP — so Gmail search/read,
> **recruiter radar**, and the J2 in-app queue call were ALL blocked at the transport layer
> ("url not allowed on the configured scope"). OAuth worked (Rust reqwest, no scope). Added both
> hosts to capabilities + CSP. **These three features have NOT completed a live in-app API call
> yet** — re-verify after `npm run tauri dev`. (J2's tool logic WAS verified by hitting the real
> API directly via curl; only the in-app path was scope-blocked.) T1-F4-class bug; unit tests
> mock `getHttpFetch` so they can't catch a missing allowlist entry.

## 3. DONE + MERGED (this session, 2026-07-04 → 07-05)

| Item | What | Key commits |
|---|---|---|
| **12 · Gmail live repair** | G-13 (OAuth `redirect_uri` was built from the browser's ephemeral peer port, not the listener port → every token exchange failed) FIXED; G-12 empty-query; G-14 tests | `0d847f1`, `9da1803` (tsc hotfix) |
| **14 · Travel route garble** | Spoke Google's raw slash-joined road chain → TTS garble; now speaks only the first segment before `/` | `1654a0c` |
| **13 · Recruiter Radar** | `gmail_recruiters` action; two-stage (category:primary→in:inbox fetch + LLM classify w/ heuristic fallback); stateful seen/last-check (migration v19); bare-vs-explicit windowing; spoken briefs + G-6 read hint + G-2 errorDetail | R1–R3 + RR-1/RR-3/RR-4 (`f6f9719`, `63b9afb`, `0f2f342`) |
| **10 · Job autopilot J1+J3** | J1 = Job Pipeline URL alias (voice-open); J3 = ApplicationProfile store (12 fields, Settings UI, keyed memory row → SQLCipher) | `3500695`, `e910938` |
| **7 · Voice-ID P3** | Option-A passive background-fill (fixes "not training on my voice"): `verifyVoice` always runs, `considerAddSample` fills gallery from daily use even when Voice ID off, never acting on it; P2-N1 shared `enabled` via `useVoiceStatus`; strict 100% enable-gate in the hook. 15 tests, tsc clean. | `c38ecd1` |
| **10 · Job autopilot J2** | `get_job_queue` tool (GET /api/jobs, token via secureStorage, getHttpFetch, error taxonomy, G-2); `job_queue` action + KNOWN_SAFE; JobHunterSettings token field; spoken count = API total + top 3 by fit. Live-verified against real API. | `c2bbe5f` (714f0e8 + 698355f) |
| **15 · Gmail transport scope** | `gmail.googleapis.com` + job-hunter host added to Tauri http allowlist + CSP (were blocked). Live-verified: Gmail search returns real mail. | `e525b60` |
| **9 · Travel insights P1** | `callGoogleRoutes` departureTime (now+60s floor); `sampleDepartures()` sequential, cap 8, per-sample failure capture, abort-aware. 9 tests. | `8dda179` |
| **9 · Travel insights P2** | `suggest_departure_time` tool (min-duration selection, spoken best-window) + `travel_best` action + prompt + KNOWN_SAFE. 37 tests, 559 green. | `a6e5d89` |
| **7 · Voice-ID enrollment** | 3 live bugs fixed: ONNX single-thread (Tauri no SharedArrayBuffer), `addSample` missing `created_at`, real-error surfacing; enable gate → ≥3 samples. Owner enrolled + enabled live. | `04905c4`, `fa83f69`, `540213c` |
| **7 · Voice-ID passive-fill bootstrap** | Meter stuck at enrolled count — add-gate (0.88) was stricter than match threshold (~0.85), so conversation could never grow the gallery. Now bootstrap-aware: while not mature, add-gate = match threshold; once mature, 0.88. Debug logs added. | `59e8d6d` |
| **9 · Travel insights P3** | `route_watches` migration (v20, LF-normalized), repo fns, `route_watch`/`route_watch_cancel` arm+cancel, single-active-watch replace-on-rearm, unresolved-address refusal. No findings. | `e6589b7` |

Earlier (pre-session, already merged): item 1 (travel error visibility, `4b9c997`), item 2
(no-narrated-actions, `3b85777`), item 10-H1 (job-hunter token — deployed + live-verified 2026-07-05).

> **⚠️ P3 live caveat:** passive fill only tops up an EXISTING gallery — `considerAddSample`
> requires `enrolled && match`, so it can't bootstrap from zero. **The owner must do an initial
> voice enrollment once** (a few recordings) for daily-use fill to kick in. If the gallery is
> empty, P3 alone won't start training. Verify live: enroll once → speak normally a few times →
> Status meter should climb without manual recording.

---

## 4. PENDING QUEUE — priority order

### ✅ RESOLVED LIVE 2026-07-05 — Voice ID fully working
- Enrollment failed → 3 bugs fixed: ONNX single-thread for Tauri (`04905c4`), `addSample` missing `created_at` (`fa83f69`), + real-error surfacing. Enable gate relaxed to ≥3 samples (`540213c`). **Owner enrolled to 5 samples and ENABLED Voice ID live.** Passive fill (P3) now grows the meter from normal use.

<details><summary>original blocker note</summary>
0. **Voice enrollment fails** ("Enrollment failed", 0 samples) — WavLM model download/init suspect
   (`src/lib/voice-id/embedding.ts`, `@xenova/transformers` from HF). Need the real error
   (Settings→VoiceID model-status line or in-app console) to root-cause. **Bundle the fix with:**
   the enable-gate relax (≥3 samples, not 100% — owner decision) + G-16 (stop speaking the raw
   msg-id). See `VOICE_ID_STATUS_REVIEW_FINDINGS.md` + `GMAIL_REVIEW_FINDINGS.md` G-16.

### ✅ Item 9 Travel Insights — FULLY COMPLETE (P1–P4, all merged)
Best-departure suggestion + route watch, both live-verified. P4 fixes (`aced906`) landed clean:
trigger direction correct, interval gate in place (no more 30s Google-API spam), expiry speaks
a close-out line. Nothing further scheduled unless the owner wants a P5.

### 🟢 Unblocked — agent queue, IN THIS EXACT ORDER (single worktree, one branch at a time)
1. **[CURRENT] RR-2 · Recruiter fetch-fallback tuning** — Gmail now live (G-15), probe DONE
   (`category:primary` IS honored, decision locked). Branch `fix/recradar-rr2` off `main`. See §5
   + `GMAIL_RECRUITER_RADAR_REVIEW_FINDINGS.md`. Small.
2. **G-16 + G-17 · Gmail spoken-output hygiene** — fixes the live TTS garble (raw email/id/ISO
   date/em-dash reaching speech). Branch `fix/gmail-spoken-hygiene` off `main`. See
   `GMAIL_REVIEW_FINDINGS.md` G-16/G-17. Small. **Note: touches the same file as RR-2
   (`packages/core/tools/gmail.ts`, different functions) — do RR-2 first, merge, THEN branch this
   off the updated main to avoid conflicts.**
3. **Settings menu reorg** — spec approved (`SETTINGS_REORG_PLAN.md`), P1-P3 ready.
4. **Item 11 · Natural speech V1** — `NATURAL_SPEECH_PLAN.md`, branch `feat/natural-speech`.
5. **Item 6 · Network resilience P1** — `NETWORK_RESILIENCE_PLAN.md`.
6. **Item 10-J4 · Assisted apply** — J2 landed; needs live CDP; sequence later. LinkedIn Easy
   Apply first, confirm-gated Submit.

### 🎨 Design-first (reviewer+owner specs in progress, 2026-07-05 — agent codes only after spec)
- **Settings menu reorg** (see 🟢 #3).
- **Orb (presence indicator)** — small orb + state animations; spec only for now.
- **Android roadmap** — consolidate the parked Android tracks into one phased plan.

### ⚪ Parked (don't start unless asked)
- M1.5 broad-question brevity (unhardened since owner revert), P6-F4 TTS-too-fast (needs repro),
  Ola second-opinion tool, publish draft releases.

---

## 5. OPEN FINDING — RR-2 (Recruiter Radar) — NOW ACTIONABLE (G-13 live done)

`gmailFetchRecruiterCandidates` falls back `category:primary → in:inbox` when primary returns
**0 results OR throws**. Consequence: every empty-primary bare ask does a full inbox sweep AND
leaks the spoken prefix *"I checked your inbox, sir —"*, misrepresenting normal operation as a
fallback. **First step (owner or agent via live app): determine whether `category:primary` is
honored on the connected account** (ask "any recruiter emails this week?" and check whether the
answer carries the inbox prefix / compare against visible Primary mail). Then: honored → fall
back only on error (0 = valid empty answer, no prefix); not honored → drop `category:primary`,
use `in:inbox` plainly (no prefix — it's not a fallback then). Full detail:
`GMAIL_RECRUITER_RADAR_REVIEW_FINDINGS.md`.

---

## 6. HOW WE WORK (don't relearn this the hard way)

- **Roles:** Owner decides/priorities/live-tests + holds keys. Agent writes ALL app code in the
  `D:\Learning\krishna-m15` worktree. Reviewer (Claude) plans/reviews/merges + writes docs from
  `D:\Learning\krishna` (main checkout). See [[review-not-fix-workflow]].
- **Branch model:** `main` is the single hub. Branch fresh off `main` per track
  (`git checkout -b <name> main` in `krishna-m15`); never `git checkout main` in that worktree.
  ONE branch per track — never stack two tracks on one branch (this bit us: recruiter R1 landed
  on the gmail-fix branch and had to be relocated).
- **Commit protocol:** ONE phase per commit → `npx tsc --noEmit` clean + full `npx vitest run`
  green → commit → **STOP and report.** Do not chain phases (the agent did this 3×; each time a
  gap slipped through — RR-1, RR-4). Reviewer merges after approval.
- **NEVER `git push`** (feature branch OR main) — it can trip the auto-release pipeline. Already
  violated once (`fix/gmail-latest-email` pushed to origin). See [[no-push-release-pipeline]].
- **Three gotchas:** (1) secrets go in `secureStorage`/`getSecret`, NOT Windows Credential Mgr
  (separate store the app can't read) — see [[secure-store-key-gotcha]]; personal data (e.g. the
  application profile) goes in the SQLCipher memory store. (2) Set `ExecuteActionResult.kind`
  ("answer"|"status") explicitly — don't prefix-sniff. (3) `command_log="answered"` ≠ data
  persisted — verify the actual table, not the spoken/logged outcome.
- **DB migrations must be LF-normalized** (CRLF breaks the tauri-plugin-sql checksum — T4-F5).

---

## 7. NEXT AGENT INSTRUCTION (paste this to resume)

> Read `RESUME_HERE.md` in full first. `main` is green. Start **Item 9 travel insights P1**
> (or Item 11 natural speech V1 if the owner prefers): branch `feat/travel-insights` off `main`
> in `krishna-m15`, read `TRAVEL_INSIGHTS_PLAN.md` in full, implement **P1 only**, add tests,
> `tsc --noEmit` clean + full `vitest run` green, ONE commit `feat(trvins-1)`, **STOP and report.**
> Do NOT start item 10-J2/J4 (blocked on owner H1 deploy) or chain multiple phases.
