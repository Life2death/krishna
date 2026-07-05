# RESUME HERE — Krishna handoff (updated 2026-07-05, day 2 — post live smoke test)

> **This is the single source of truth to resume from.** Reviewer (Claude), coding agent, and
> owner (Vikram) all sync through this file. Read the whole thing before touching anything.
> Deeper per-track detail lives in the `*_REVIEW_FINDINGS.md` and `*_PLAN.md` files referenced below.

---

## 1. STATUS IN ONE PARAGRAPH

`main` is **GREEN** and — new since last update — **LIVE-VERIFIED by the owner** on 2026-07-05:
the desktop app built and ran (`npm run tauri dev`, Rust side incl. the G-13 fix + migration v19
compiled clean), and the owner smoke-tested **items 12/13/14 + J1 all good**, including the
**G-13 Gmail Connect — ✓ Connected live, real mail returned.** That closes the biggest gate.
**RR-2 is now unblocked** (live data available to decide the `category:primary` question).
Owner's next focus: design work (settings menu reorg, orb, Android roadmap) + queue the agent on
RR-2 / item 7 voice-ID P3 / item 9 / item 11.

---

## 2. OWNER ACTION ITEMS

1. ~~**G-13 · Gmail live Connect**~~ — **DONE 2026-07-05, live-verified.** ✓ Connected; searches
   return real mail. Gmail + Recruiter Radar are live.
2. **H1 · Deploy the job-hunter API token** — **CONFIRM STATUS.** If done: J2 unblocks. If not:
   `D:\Learning\job-hunter` → merge `feat/krishna-api-token`, generate a token
   (`python -c "import secrets; print(secrets.token_urlsafe(48))"`), set `KRISHNA_API_TOKEN` +
   `KRISHNA_API_USER_EMAIL=vikram.panmand@gmail.com` in Render, push.
3. **J3 restart-persistence check (small):** Application Profile was filled+saved in-session;
   the definitive test (quit app → relaunch → fields persist) — do once in passing.

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

### 🟢 Unblocked — agent can start now (owner-reprioritized 2026-07-05)
1. **RR-2 · Recruiter fetch-fallback tuning** — NOW UNBLOCKED (G-13 live). See §5. Small.
2. **Item 7 · Voice-ID P3** — **this fixes the owner's live complaint "why isn't it training on
   my voice":** root cause confirmed at `KrishnaVAD.tsx:72-95` — passive learning
   (`considerAddSample`, ≥0.88 auto-add) only runs when Voice ID is **enabled**; when disabled,
   `verifyVoice` is skipped entirely, so zero samples are ever added from daily use. And enabling
   requires the meter at 100% (~24 manual recordings) → chicken-and-egg. P3's owner-chosen
   **Option A background-fill** (silently top up samples from normal use while Voice ID is off,
   never acting on it) is exactly the fix. Plan: `VOICE_ID_STATUS_METER_PLAN.md` (+ P2-N1 shared
   `enabled`, strict-gate the old Settings toggle).
3. **Settings menu reorg** — owner request 2026-07-05; grouped-submenu spec being designed with
   the reviewer (incl. deduping the system-prompt editing that appears in both KrishnaSettings
   and Persona). Spec doc to come before agent codes.
4. **Item 9 · Travel insights P1** — `TRAVEL_INSIGHTS_PLAN.md`, branch `feat/travel-insights`.
5. **Item 11 · Natural speech V1** — `NATURAL_SPEECH_PLAN.md`, branch `feat/natural-speech`.
6. **Item 6 · Network resilience P1** — `NETWORK_RESILIENCE_PLAN.md`.

### 🔴 Blocked — do NOT start until the gate clears
- **Item 10-J2** (queue read tool) — needs owner **H1 deploy** confirmation (§2.2).
- **Item 10-J4** (assisted apply, LinkedIn/Naukri, confirm-gated Submit) — later; needs live CDP.

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
