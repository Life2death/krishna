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

## Owner decisions — ALL ANSWERED 2026-07-04 (nothing blocked on the owner anymore)

1. **Job-hunter API:** ~~does one exist?~~ **It already does** — reviewer inspected
   `D:\Learning\job-hunter\web_app.py` (Flask + Supabase): `GET /api/jobs` with
   `status/portal/track/min_fit/limit/offset` filters (`?status=not_applied` IS the queue),
   `/api/jobs/count|stats|breakdown`, `POST /api/jobs/<id>/status`. The only gap is machine
   auth (session-cookie only today). The agent adds a bearer-token path — full spec in
   **`JOB_HUNTER_API_PLAN.md`** (phase H1, done in the `D:\Learning\job-hunter` repo).
2. **Browser tech:** owner approved **CDP into his real Chrome**. J4 proceeds on CDP as
   specced; `computer_*`/vision remains the documented fallback only.
3. **Portals:** owner: **"start with LinkedIn and Naukri, then scale."** J4 MVP targets
   LinkedIn Easy Apply first (most structured), Naukri second; external ATS is out of MVP.

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
| H1 | `feat(kapi-h1)` | bearer-token auth in job-hunter repo (`JOB_HUNTER_API_PLAN.md`) | nothing |
| J1 | `feat(jobap-j1)` | pipeline URL alias + prompt + tests | nothing |
| J2 | `feat(jobap-j2)` | queue read tool + settings + tests | H1 reviewed + owner sets Render env + deploys |
| J3 | `feat(jobap-j3)` | application profile store + settings UI + tests | nothing |
| J4 | `feat(jobap-j4)` | CDP attach, LinkedIn Easy Apply flow, submit gate, truth check, tests | J2, J3 |
| J4b | `feat(jobap-j4b)` | Naukri apply flow on the same pipeline | J4 |

`npx tsc --noEmit` clean + full `npx vitest run` green after every phase (pytest green for
H1 in the job-hunter repo), then STOP and report. All owner decisions are in — H1, J1, J3
are startable today; J2 needs H1 deployed; J4 targets LinkedIn first, then Naukri (J4b).
