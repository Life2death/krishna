# Recruiter radar plan — "any emails from recruiters?"

> Spec for the coding agent. Owner request 2026-07-04. This will be the owner's **most-asked
> Gmail question**, so precision and a natural spoken answer matter more than shaving a second
> of latency. Owner decisions captured 2026-07-04 (all four via direct Q&A):
> 1. **What counts:** individual human recruiter/TA outreach **plus** LinkedIn/Naukri
>    recruiter-message notification emails (InMail "a recruiter sent you a message",
>    Naukri recruiter contact). **Job-alert digests are noise** — always excluded.
> 2. **Window:** stateful — "since I last asked" (a local seen/last-check state), NOT a fixed
>    lookback.
> 3. **Spoken depth:** count + per-email brief, capped at 3 spoken briefs, rest as a count.
> 4. **Approach:** two-stage — broad Gmail recall, then one LLM classification call before
>    speaking. Owner accepted the ~1–3s extra latency.
>
> **Branch:** `fix/gmail-recruiter-radar` off `main` — but **sequence AFTER item 12 (G-12)
> merges**; both touch `gmail.ts` and the GMAIL prompt section. **Commit prefix:**
> `feat(recradar-rN)`. **Findings:** append to `GMAIL_REVIEW_FINDINGS.md` (same Gmail track).

## Owner context that shapes the design
- Recruiter mail reliably lands in **Gmail's Primary category** (owner curated this himself) —
  so `category:primary` is a safe high-recall filter for stage 1.
- Subject lines commonly carry: `JD`, `Job`, `Job description` — useful *signals* for the
  classifier, but NOT a recall filter (recruiters also write "Exciting opportunity for
  Delivery Head" with none of those words — that's precisely why stage 1 must be broad and
  stage 2 semantic).
- Single account: the one Gmail account already connected via Phase 4a OAuth.

## Architecture — two stages plus state

### Stage 1 — recall (one Gmail fetch, deliberately broad)
- Query: `category:primary after:<since>` — **no keyword net at recall**. Since-last-ask is
  usually under a day of Primary mail; volume is small.
- **Fallback:** `category:primary` may NOT be a recognized Gmail operator (Gmail's documented
  categories are `social`, `promotions`, `updates`, `forums`; Primary is the implicit default).
  If an API call with `category:primary` returns 0 results while the inbox visibly has mail,
  fall back to `in:inbox after:<since>` — broader but safe (inbox is the superset of primary).
  On fallback, prefix the spoken answer with "I checked your inbox, sir —".
- `<since>`: last-check timestamp from state (below). **Cold start (no state): 7 days.**
  **Hard caps: 14-day max window, 25 messages max** (newest first). If the cap truncates,
  the spoken answer must SAY so ("I checked your last 25 primary emails") — no silent caps.
- Reuse the existing `gmailFetch` + per-message metadata pattern from
  `gmail.ts` (From / Subject / snippet per id — the same shape `gmail_search` already builds).

### Stage 2 — classify (one LLM call for the whole batch)
- Input: JSON array of `{id, from, subject, snippet}`. One call, all candidates, temperature
  low, small max-tokens, **strict JSON out**; validate and retry once on malformed output.
- Classes per message: `recruiter_outreach` | `job_alert_digest` | `other`.
  - `recruiter_outreach` includes: human recruiter/TA/consultancy emails, AND
    LinkedIn messaging/InMail notifications, AND Naukri recruiter-contact notifications.
  - `job_alert_digest`: LinkedIn/Naukri/Indeed "N new jobs for you", newsletters, marketing.
- Also extract when present: `recruiterName`, `company`, `roleTitle`, `via`
  ("direct" | "linkedin" | "naukri" | other portal).
- Signals to hand the classifier in its instructions: subject tokens (JD, job, job
  description, opening, opportunity, hiring, requirement, CV, resume, profile, shortlisted),
  sender-domain hints (`jobs-noreply@linkedin.com` = digest; LinkedIn *messaging* notification
  senders = outreach; same split for Naukri), and the snippet text.
- **Plumbing:** do NOT add a new AI client. `executeAction` already receives `llmFallback`
  (the app's existing LLM call path). Implement the core logic as a dependency-injected
  function (e.g. `checkRecruiters({fetchCandidates, classify})` in `packages/core`) and have
  the `actions.ts` branch supply `classify` built on `llmFallback`. Fully unit-testable with
  a mocked classify.
- **Degradation path (required):** if the classification call fails (or returns garbage
  twice), fall back to a keyword+domain heuristic: subject-line regex
  `/(jd|job|opening|opportunity|hiring|requirement|cv|resume|profile|shortlisted)/i`
  combined with a digest-sender blacklist (`jobs-noreply@linkedin.com`,
  `noreply@naukri.com`, indeed digest senders). If subject matches AND sender is not
  blacklisted, treat as `recruiter_outreach`. Prefix the spoken answer with a hedge
  ("Roughly, sir — my filter is running blind:"), and log the REAL failure reason via
  `errorDetail` → `command_log.detail` + `speech_log source:"error"` (the item-1/EV-1
  discipline, already wired for travel).

### State — "since I last asked"
- New migration (LF-normalized — T4-F5 checksum gotcha) with two pieces:
  - `recruiter_seen(message_id TEXT PRIMARY KEY, first_seen_at INTEGER)` — every candidate id
    that has been through classification (all classes, not just outreach — prevents
    re-classifying old mail on the next ask).
  - last-check timestamp (single-row table or existing kv mechanism — agent's choice, say
    which in the phase report).
- **Bare ask** ("any emails from recruiters?"): report only `recruiter_outreach` whose id is
  NOT in `recruiter_seen`. After answering, mark all fetched candidates seen + update
  last-check.
- **Explicit window** ("any recruiter mail this week?" → `window_days`): stateless sweep —
  ignore the seen-filter for reporting (he asked for the week, give the week), but still
  upsert seen state afterward. Cap `window_days` at 14.

## Action + prompt wiring
- New action (dedicated — do NOT make the weak model compose Gmail queries for this):
  ```action
  {"action":"gmail_recruiters"}
  ```
  optional `{"window_days": 7}` when the user names a window.
- Prompt (GMAIL section): 2–3 trigger examples — "any emails from recruiters?", "did any
  recruiter reach out?", "any recruiter mail this week?" (→ window_days 7). Keep them tight;
  this section is already long.
- `executeAction` branch: `kind:"answer"`, error propagation per the G-2 pattern,
  `errorDetail` populated on any stage failure.

## Spoken output (formatter)
- 0 new: "No new recruiter emails since yesterday evening, sir." (say the actual since-time
  in natural words: "this morning" / "yesterday" / "the last 7 days")
- 1–3 new: brief per email — "Priya from ABC Consultants about a Delivery Head role, via
  LinkedIn" — name/company/role only when the classifier extracted them; degrade gracefully
  to sender + subject.
- >3: top 3 briefs (newest first) + "…and N more, sir — they're on the dashboard."
- **Follow-up read (v1 limitation, be explicit):** append the FIRST message's id using the
  existing G-6 mechanism ("To read the first one, use gmail_read with id …") so "read it"
  works. Reading the 2nd/3rd by name needs the structured-context side-channel flagged in
  G-6 — that is v2, not this track. Do not fake it.
- `data`: full classified results JSON (ids, classes, extractions) for the dashboard.

## Explicitly rejected / out of scope (v1)
- Auto-reply or "reply with my notice period" — read-only track; reply flows come later and
  will be confirm-gated like gmail_send.
- Per-message LLM calls or full-body classification — metadata+snippet batch call only.
- A background poller ("tell me when a recruiter mails") — that's a future marriage of this
  classifier with the item-9 route-watch scheduler pattern; do not build it here.
- Multi-account, non-Gmail providers, training a local classifier model.

## Pre-flight checks (resolve before R1)

- [ ] **Verify `category:primary` works** via Gmail API on the connected account. If it
      returns 0 results despite visible Primary mail, delete the operator from the query and
      rely on the Stage 1 fallback (`in:inbox`).
- [ ] **Pick state mechanism** after inspecting existing DB/kv layer. If a `settings` or
      `key_value` table already exists, use it for last-check timestamps + seen state rather
      than creating a new migration.
- [ ] **Confirm "dashboard" exists** or choose replacement text for the >3 spoken output line
      ("…and N more, sir — they're on your email list.").
- [ ] **Check `llmFallback` signature** — the classify wrapper needs to accept a prompt string
      and return parsed JSON. Verify the existing signature supports this before wiring.

## Phases

| Phase | Commit prefix | Content |
|---|---|---|
| R1 | `feat(recradar-r1)` | core `checkRecruiters` (recall + injected classify + formatter + caps + degradation), tests: digest-vs-outreach separation, LinkedIn/Naukri notification handling, classify-failure fallback + errorDetail, cap messaging |
| R2 | `feat(recradar-r2)` | seen/last-check migration + stateful bare-ask vs stateless explicit-window semantics, tests incl. "second ask same day returns nothing new" |
| R3 | `feat(recradar-r3)` | action parse/execute wiring, prompt examples, logOutcome/errorDetail integration, end-to-end tests with mocked fetch+classify |

`npx tsc --noEmit` clean + full `npx vitest run` green after every phase, then STOP and report.

## Cost/latency note (for the owner, not the agent)
Each bare ask ≈ 1 Gmail list call + up to 25 metadata calls (only for unseen mail — typically
a handful) + 1 small LLM classification call. At a few asks per day this is negligible on both
Gmail quota and API spend; the 1–3s classify latency is covered by the existing ack/filler line.
