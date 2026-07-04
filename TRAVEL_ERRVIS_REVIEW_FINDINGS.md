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

**Fix (small):** thread `errorDetail` into the sink. Two acceptable shapes:
1. Have `decideActionResponse` carry `errorDetail` through to `ActionResponsePlan.detail` (or a
   new field) even when `outcome === "answered"`, and pass it to `logOutcome`'s `detail` arg so
   `command_log` shows the real reason on a friendly-but-degraded answer; **and/or**
2. In the handler, when `result.errorDetail` is set, emit a `speech_log` entry with
   `source:"error"` carrying the real reason (spoken line stays the friendly fallback) — this is
   the "dashboard shows truth even when voice doesn't" behaviour the item explicitly asks for,
   and it matches the T4-F7 speech_log observability pattern already in the codebase.

Add a test at the **handler/log layer** (not just the tool layer) asserting that a fallback with
`errorDetail` produces a log entry containing the real reason — the current tests only prove the
field is populated, which is why the dead-end slipped through (same test-blindspot that hid
Gmail G-11).

---

## Item 2 — `fix/no-narrated-actions` commit `65fd417`

Promoted the one-liner out of the REMEMBER section into a prominent `ONE ACTION PER TURN
(CRITICAL)` block with concrete prohibited patterns ("now let me check", "I'll do that next").
Prompt-only, and for the *narration* bug it targets, the phrasing is clear and well-placed — a
good fix for the reported symptom. One real risk though.

### NA-1 · BUG (prompt contradiction) · blanket "exactly ONE thing per reply" collides with the multi-step `plan` feature and the ACKNOWLEDGE-THEN-ACT rule
The new block contains two blanket lines that overreach past narration into legitimate territory:
- *"You must do exactly ONE thing per reply."*
- *"If the user asks for multiple things, ask which one first. Do NOT chain them yourself."*

But the SAME prompt (lines 160–186) actively instructs the model to emit a multi-step ```plan
block — `youtube_search → open_target`, `open cmd → type → enter` — for a *single* request like
"play this song on YouTube." And ACKNOWLEDGE-THEN-ACT (line 192) literally tells it to say *"this
needs a couple of steps, give me a minute"* then emit the plan. So the model now gets:
- "do exactly ONE thing / don't chain" (new block), vs.
- "here's how to chain several tool steps in one plan / acknowledge multi-step work" (existing).

This is a **direct contradiction**, and item 2 exists precisely *because* this is a weak model
that follows instructions unreliably — an internal contradiction is the worst thing to hand it.
Likely failure mode: the model either (a) stops using legitimate ```plan blocks ("play X on
YouTube" degrades to asking "which one first?"), or (b) resolves the conflict unpredictably per
turn. The narration bug is about **describing an action with no block that runs it**; a ```plan
whose steps actually execute is NOT that bug.

**Fix:** scope the rule to narration, not action count. Reframe as: *"Never describe an action
that isn't in THIS reply. Everything you say you'll do must be backed by an `action` or `plan`
block in the same message — if there's no block for it, don't say it. A multi-step `plan` block
is the correct way to do several steps at once (its steps really run); narrating 'then I'll do
Y' with no block for Y is the lie to avoid."* Drop / rewrite the "exactly ONE thing per reply"
and "ask which one first / do not chain" lines so they don't fight the plan feature. Keep the
concrete bad examples — they're good.

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
