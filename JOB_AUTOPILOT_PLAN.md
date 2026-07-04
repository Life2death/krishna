# Job autopilot plan — voice-driven job pipeline + assisted apply

> Spec for the coding agent. Owner request 2026-07-04. Goal, in the owner's words: open the
> job pipeline at `https://job-hunter-x5l1.onrender.com/queue` by voice, have Krishna start
> applying to queued jobs — open the job's apply URL, find the Apply button, click it, fill in
> the relevant details when asked, and click Submit.
>
> **Branch:** `feat/job-autopilot` off `main`. **Commit prefix:** `feat(jobap-jN)`.
> **Findings file:** `JOB_AUTOPILOT_REVIEW_FINDINGS.md`. One phase per commit, stop + report.

## Reality check (read before estimating)

The queue page is the owner's OWN app (job-hunter on Render) — that half is easy and clean.
The **apply targets are third-party portals** (LinkedIn, Naukri, company ATS pages like
Workday/Greenhouse/Lever) — arbitrary login-walled web forms with CAPTCHAs, multi-page flows,
and anti-bot measures. There is no reliable "click apply and fill anything anywhere" in one
phase. This plan therefore builds an **assisted, human-in-the-loop applier**: Krishna does the
navigation and form-filling labor, the owner gives one spoken confirmation before any Submit
is clicked. **Full unattended mass-apply is explicitly out of scope** — consistent with the
owner's own job-search skill convention ("never auto-submits an application").

## Owner decisions needed BEFORE J2/J4 (agent: do not guess past these — J1 has no blockers)

1. **Does job-hunter expose a JSON API?** (e.g. `GET /api/queue`, `POST /api/jobs/:id/applied`)
   and what auth does it use? If none exists, the owner adds one to the job-hunter repo (he
   owns it) — scraping our own app's HTML is rejected as the fragile option.
2. **Browser automation tech for J4** — recommendation: **CDP (Chrome DevTools Protocol) into
   the owner's real Chrome** launched with `--remote-debugging-port`, driven from Rust
   (`chromiumoxide` or raw WebSocket). Rationale: DOM-level `querySelector`/fill/click is
   robust; the real browser carries the owner's logged-in LinkedIn/Naukri sessions, which
   sidesteps most login walls legitimately. Fallback/alternative: the existing `computer_*`
   tools + screen-capture vision (zero new deps, but coordinate-guessing on forms is fragile —
   fine for "click the Apply button", poor for 12-field forms). Owner picks; plan assumes CDP.
3. **Which portals dominate the current queue?** Determines which form shapes J4's filler
   handles first (LinkedIn Easy Apply is the highest-value single target; external ATS forms
   are the long tail).

## Phases

### J1 — voice-open the pipeline (trivial, no blockers, can ship immediately)
- Add `"job pipeline"` / `"my job queue"` to `src/config/app-aliases.ts` mapping to
  `https://job-hunter-x5l1.onrender.com/queue` (the existing `open` action already handles
  URLs and aliases — this is config + one prompt example, nothing more).
- Prompt: one example in `BASE_SYSTEM_PROMPT` ("open my job pipeline" → open action).
- Tests: alias resolves; parse+execute path (mocked invoke).

### J2 — queue read tool ("how's my job pipeline looking?")
- New tool `job_queue_status` (KNOWN_SAFE, read-only): `GET` the job-hunter queue API with a
  token from `secureStorage` (key e.g. `JOB_HUNTER_API_TOKEN` — gotcha #1: app secure store,
  never Credential Manager). Spoken: *"Twelve jobs in the queue, sir — three added today.
  Top one is Senior Delivery Manager at Persistent."* `data`: the raw queue JSON.
- Settings: a small field in Integrations (or its own section) for the API base + token,
  following the `MapsSettings.tsx` pattern.
- Error propagation per the G-2 pattern from day one — real reason into `result.error`,
  surfaced by the action layer, logged to `command_log`.
- Tests: success formatting, 401/timeout produce distinguishable spoken/logged reasons.

### J3 — application profile store (what gets typed into forms)
- Local, structured profile: full name, email, phone, current location, notice period,
  current/expected CTC, years of experience, resume file path (local PDF), LinkedIn URL, and
  a small set of canned answers ("why this role", relocation yes/no, etc.).
- Storage: new `application_profile` table (single row) OR structured `memories` keys —
  agent proposes at review; either is fine as long as CTC/phone live in the DB (already
  encrypted at rest via the app's SQLCipher/master-key setup) and NOT in plaintext config.
- Settings UI section to view/edit. Voice edit is NOT in scope ("update my notice period"
  can come later).
- Tests: CRUD, missing-field detection (J4 needs to know what's unfillable).

### J4 — assisted apply MVP ("apply to the next job")
Single-job, fully supervised loop:
1. Pull the next unapplied job from the queue API (J2 client).
2. Open its apply URL in the CDP-attached Chrome; detect the Apply button (DOM heuristics:
   `button/a` with text ~ /apply/i) and click it.
3. Enumerate visible form fields; fill what maps to the J3 profile (name/email/phone/resume
   upload/notice period...). Build a list of (a) what was filled, (b) required fields it
   could NOT map.
4. Krishna asks the unmapped questions **by voice**, one at a time, and fills the answers.
5. **The Submit gate — non-negotiable:** `job_apply_submit` is a **sensitive** action
   (NOT `KNOWN_SAFE`), confirm-gated through the verbatim-confirm channel (the G-5
   mechanism): *"Ready to submit the application to Persistent for Senior Delivery Manager —
   shall I send it, sir?"* Only a spoken yes clicks Submit.
6. **Truth check before claiming success (gotcha #3):** after the click, verify an actual
   success signal (URL change / confirmation element / network 2xx on the submit request)
   before saying "applied". If ambiguous, SAY it's ambiguous. Then `POST` applied-status back
   to job-hunter + audit entry.
- Stop conditions: CAPTCHA or login wall detected → stop, tell the owner what's blocking,
  hand over ("the page wants a CAPTCHA, sir — it's on your screen"). Never attempt to
  bypass anti-bot measures.
- Scope for MVP: **one portal family working end-to-end** (per owner decision #3) beats
  half-working on five.
- Tests: field-mapping unit tests against fixture DOMs, submit-gate refuses without confirm,
  success-verification logic, stop-condition detection.

### J5 — batch semi-auto (PARKED — do not build)
Queue up N jobs, auto-fill each, owner confirms each submit in sequence. Only after J4 has
proven itself live for a while. Full no-confirm auto-apply is rejected permanently.

## Explicitly rejected techniques
- Scraping the owner's own job-hunter HTML instead of an API (fragile, he owns the backend).
- Storing portal passwords anywhere in the app (CDP + already-logged-in Chrome sessions
  instead; if a portal is logged out, that's a stop-condition).
- CAPTCHA solving/bypass of any kind.
- Unattended submit, batch or otherwise — every submit is one spoken confirmation.
- A generic "AI browses the web" agent loop. J4 is a fixed, testable pipeline with owner
  checkpoints, not an autonomous browser agent.

## Phase/commit map

| Phase | Commit prefix | Content | Blocked on |
|---|---|---|---|
| J1 | `feat(jobap-j1)` | pipeline URL alias + prompt + tests | nothing |
| J2 | `feat(jobap-j2)` | queue read tool + settings + tests | decision #1 |
| J3 | `feat(jobap-j3)` | application profile store + settings UI + tests | nothing |
| J4 | `feat(jobap-j4)` | CDP attach, apply flow, submit gate, truth check, tests | #2, #3, J2, J3 |

`npx tsc --noEmit` clean + full `npx vitest run` green after every phase, then STOP and report.
J1 and J3 are unblocked today; J2/J4 wait on the owner's three answers above.
