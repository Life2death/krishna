# Travel error-visibility + narrated-actions review findings

> Reviewer (Claude) findings for pending items 1 & 2. Agent: fix OPEN `BLOCKER`/`BUG` items,
> mark `FIXED (commit <sha>)`. Lives on `main` in `D:\Learning\krishna`.

## Item 1 — `fix/travel-error-visibility` commit `d52b4a7`

The tool-layer half is correct: the empty `catch {}` in `getTravelTimeTool.run`
(`get-travel-time.ts`) now captures `err.message` into `data.errorDetail`, and
`executeAction` copies it onto `ExecuteActionResult.errorDetail` (`actions.ts:198`). Tests
assert a 403 body and a "No routes found" case produce distinguishable `errorDetail`. Good so
far — but the item is only **half implemented.**

### EV-1 · BLOCKER · `errorDetail` is captured and propagated but NEVER logged — the diagnostic trail still doesn't exist
The entire point of item 1 (verbatim from `pendingitems03july.md`): *"pass the caught error's
message ... so the caller can `logOutcome(..., "tool_failed", <real reason>, ...)` instead of
nothing ... the dashboard should show the truth even when the voice doesn't."*

Traced the consumer. In `krishna.context.tsx` the single-action handler (the path travel_time
takes) calls:
```ts
const plan = decideActionResponse(result, spokenTextRecorded);   // actions.ts:99
...
logOutcome(command, plan.outcome, plan.failureReason, plan.detail, result.spokenResponse);  // :1909
```
- `decideActionResponse` **never reads `result.errorDetail`** — it derives `detail` purely from
  `spokenResponse`/`ok`.
- On the fallback path the tool returns `success: true` (it DID open the maps URL), so
  `result.ok === true` → `outcome: "answered"`, `failureReason: undefined`, `detail: undefined`.
- Confirmed by grep: outside test files, `ExecuteActionResult.errorDetail` has **zero readers**
  in production code (the only other `errorDetail` hits are an unrelated local var in
  `github-workflow.ts`).

Net: `command_log` still records a cheerful "answered" with no reason, and nothing is written to
`speech_log` with `source:"error"`. The real Google reason is captured into a field that dies in
memory. This is the **same swallow-one-layer-up shape as Gmail G-2** — the field exists, the sink
doesn't. A live failure today would still show the dashboard nothing, which is exactly what item
1 was filed to end.

**FIXED (commit `4b9c997`).** `decideActionResponse` now reads `result.errorDetail` and
prefers it as `detail` regardless of outcome, so `logOutcome` receives the real reason
into `command_log.detail`. Additionally, the handler emits a `speech_log` entry with
`source:"error"` when `errorDetail` is set, matching the T4-F7 dashboard-observability
pattern. Both paths now thread the real Google error to the log sink — not just the
tool layer.

---

## Item 2 — `fix/no-narrated-actions` commit `65fd417`

Promoted the one-liner out of the REMEMBER section into a prominent `ONE ACTION PER TURN
(CRITICAL)` block with concrete prohibited patterns ("now let me check", "I'll do that next").
Prompt-only, and for the *narration* bug it targets, the phrasing is clear and well-placed — a
good fix for the reported symptom. One real risk though.

### NA-1 · BUG (prompt contradiction) · blanket "exactly ONE thing per reply" collides with the multi-step `plan` feature and the ACKNOWLEDGE-THEN-ACT rule
**FIXED (commit `3b85777`).** Dropped the "exactly ONE thing per reply" and "ask which one
first / do not chain" lines. Reframed as `NEVER NARRATE UNEXECUTED ACTIONS (CRITICAL)`:
never describe an action without a block in this reply; multi-step `plan` blocks are
correct and explicitly exempted. Concrete bad examples kept.

### NA-2 · NIT · no live/behavioural check
Pure prompt change, no test (understandable — prompt behaviour is hard to unit-test). The item's
own guidance said prompt-first, code-detector only if the prompt doesn't hold up live. So the
real validation is the owner's live retest: after this lands, confirm the "Saving that now...
now let me check the travel time" double-narration is actually gone AND that "play <song> on
YouTube" still produces a working multi-step plan (guards against NA-1's regression). Flag both
for the live test.

---

## Build/verification (reviewer, `tmp/integ-items-1-2` = main + both branches)
`tsc --noEmit` clean; targeted suites (travel-time, actions, phase1-prompt) 101/101 green; vite
production build status recorded in the session. Both branches merge cleanly into current `main`
(disjoint files). **Recommendation: item 2 can merge after NA-1 is fixed; item 1 should NOT be
called done until EV-1 wires the sink — the field is currently dead in production.**
