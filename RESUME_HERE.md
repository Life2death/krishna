# RESUME HERE — Krishna handoff (updated 2026-07-05, night)

> **This is the single source of truth to resume from.** Reviewer (Claude), coding agent, and
> owner (Vikram) all sync through this file. Read the whole thing before touching anything.
> Deeper per-track detail lives in the `*_REVIEW_FINDINGS.md` and `*_PLAN.md` files referenced below.

---

## 1. STATUS IN ONE PARAGRAPH

`main` is **GREEN** (tip `e6ee68a`; tsc clean, affected suites green). Everything code-side that
could be closed this session is closed and merged. **Three features shipped today** — Gmail live
OAuth repair (item 12), travel spoken-route fix (item 14), and the full Recruiter Radar feature
(item 13) — plus job-autopilot J1+J3. **Nothing is half-merged or broken.** The only things left
are (a) two **owner** actions that gate live verification, and (b) fresh feature work for the agent
on unblocked tracks. Start the agent on **item 9 or item 11**; do the two owner actions when you can.

---

## 2. OWNER ACTION ITEMS (only you can do these — they unblock everything downstream)

1. **G-13 · Gmail live Connect (one-time).** In the running app: Settings → Gmail → paste the
   Google OAuth client_id/secret (if not already) → **Connect** → confirm it flips to **✓ Connected**
   → ask *"any email from <someone>?"* and confirm real mail comes back. **This gates ALL live
   verification of Gmail + Recruiter Radar, and settles finding RR-2.** The code is fixed and
   merged; this is the last mile only you can walk.
2. **H1 · Deploy the job-hunter API token.** In the `D:\Learning\job-hunter` repo: merge
   `feat/krishna-api-token` → `main`, generate a token (`python -c "import secrets; print(secrets.token_urlsafe(48))"`),
   set `KRISHNA_API_TOKEN` + `KRISHNA_API_USER_EMAIL=vikram.panmand@gmail.com` in the Render
   dashboard, push (Render auto-deploys). **This unblocks item 10-J2.**

---

## 3. DONE + MERGED (this session, 2026-07-04 → 07-05)

| Item | What | Key commits |
|---|---|---|
| **12 · Gmail live repair** | G-13 (OAuth `redirect_uri` was built from the browser's ephemeral peer port, not the listener port → every token exchange failed) FIXED; G-12 empty-query; G-14 tests | `0d847f1`, `9da1803` (tsc hotfix) |
| **14 · Travel route garble** | Spoke Google's raw slash-joined road chain → TTS garble; now speaks only the first segment before `/` | `1654a0c` |
| **13 · Recruiter Radar** | `gmail_recruiters` action; two-stage (category:primary→in:inbox fetch + LLM classify w/ heuristic fallback); stateful seen/last-check (migration v19); bare-vs-explicit windowing; spoken briefs + G-6 read hint + G-2 errorDetail | R1–R3 + RR-1/RR-3/RR-4 (`f6f9719`, `63b9afb`, `0f2f342`) |
| **10 · Job autopilot J1+J3** | J1 = Job Pipeline URL alias (voice-open); J3 = ApplicationProfile store (12 fields, Settings UI, keyed memory row → SQLCipher) | `3500695`, `e910938` |

Earlier (pre-session, already merged): item 1 (travel error visibility, `4b9c997`), item 2
(no-narrated-actions, `3b85777`), item 10-H1 code (job-hunter token — awaits owner deploy above).

---

## 4. PENDING QUEUE — priority order

### 🟢 Unblocked — agent can start now (pick top of list)
1. **Item 9 · Travel insights P1** — best-departure suggestion + route watch. Plan:
   `TRAVEL_INSIGHTS_PLAN.md`. Branch `feat/travel-insights` off `main`. Prefix `feat(trvins-pN)`.
   (Dependency item 1 already landed, so it's clear.)
2. **Item 11 · Natural speech V1** — variety engine, kills the "One moment, sir" monotony
   (owner-requested). Plan: `NATURAL_SPEECH_PLAN.md`. Branch `feat/natural-speech`. Prefix
   `feat(speech-vN)`.
3. **Item 6 · Network resilience P1** — turn queue / offline handling. Plan:
   `NETWORK_RESILIENCE_PLAN.md`. Branch `feat/network-pN`.
4. **Item 7 · Voice-ID P3+P4** — strict-gate the Settings toggle, shared `enabled`, Option-A
   background fill. Plan: `VOICE_ID_STATUS_METER_PLAN.md`.

### 🔴 Blocked — do NOT start until the gate clears
- **Item 10-J2** (queue read tool) — needs owner **H1 deploy** (§2.2).
- **Item 10-J4** (assisted apply, LinkedIn/Naukri, confirm-gated Submit) — later; needs live CDP.
- **RR-2** (Recruiter Radar fetch fallback) — needs **G-13 live** data (§2.1). See §5.

### ⚪ Parked (don't start unless asked)
- M1.5 broad-question brevity (unhardened since owner revert), P6-F4 TTS-too-fast (needs repro),
  Android tracks (`setTorch` ACL), Ola second-opinion tool, publish draft releases.

---

## 5. OPEN FINDING — RR-2 (Recruiter Radar, non-blocking, needs G-13 live)

`gmailFetchRecruiterCandidates` falls back `category:primary → in:inbox` when primary returns
**0 results OR throws**. Consequence: every empty-primary bare ask does a full inbox sweep AND
leaks the spoken prefix *"I checked your inbox, sir —"*, misrepresenting normal operation as a
fallback. **Fix after G-13 live tells us whether `category:primary` is honored on the account:**
if yes → fall back only on error (treat 0 as a valid empty answer, no prefix); if no → drop
`category:primary` and just use `in:inbox`. Full detail: `GMAIL_RECRUITER_RADAR_REVIEW_FINDINGS.md`.

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
