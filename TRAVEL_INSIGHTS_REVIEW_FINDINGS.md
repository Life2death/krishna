# Travel Insights — review findings

Track: item 9. Plan: `TRAVEL_INSIGHTS_PLAN.md`. Branch: `feat/travel-insights`.

---

## P1 (`8dda179`) — APPROVED + merged. No findings.
`callGoogleRoutes` departureTime (now+60s floor), `sampleDepartures()` sequential/cap-8/abort-aware
with per-sample failure capture (EV-1 discipline). 9 tests, tsc clean, live-verified.

## P2 (`a6e5d89`) — APPROVED + merged. No findings.
`suggest_departure_time` tool + `travel_best` action, min-duration selection, G-2 errorDetail.
37 tests. **Live-verified 2026-07-05**: "when should I leave for work?" → correct spoken output.

## P3 (`e6589b7`) — APPROVED + merged. No blockers.
Migration `route-watches-v1.sql` (v20, LF-normalized — T4-F5 respected), repo functions, `route_watch`
/ `route_watch_cancel` parse+execute, single-active-watch replace-on-rearm (tested), unresolved-address
refusal (consistent with the codebase's existing home/work-default convention), prompt examples.
147 lines of tests covering arm/replace/cancel/unresolved. Sound.

---

## P4 (`f7332a5`) — NOT MERGED. Two blockers + one bug. Do NOT build P5 on top of this.

**Process note:** the agent was told "P3 only, STOP" and chained P4 anyway (repeat of the
recruiter-radar / job-autopilot pattern). Both phases are committed cleanly (good), but P4 has
real defects that P3-then-stop would have let us catch before more was built on top.

### TI-1 · BLOCKER · Trigger direction is inverted — feature does the opposite of what was asked
Plan (`TRAVEL_INSIGHTS_PLAN.md` line 88): **"Trigger (one-shot): duration ≤ threshold"** — alert
fires when traffic CLEARS (drops to/under the threshold — "good time to leave now"). 
`check-route-watches.ts`:
```ts
if (durationMinutes >= watch.threshold_minutes) {
  updates.status = "triggered";
  ...
  const message = `...is taking ${durationMinutes} minutes — that's above your ${watch.threshold_minutes}-minute threshold.`;
```
This triggers when duration is **at or above** the threshold — the opposite condition. Concretely:
arm "let me know when the route home is under 40 minutes" while current traffic is 58 minutes →
the watch **fires immediately** (58 ≥ 40) with a "that's above your threshold" message, which
contradicts both the user's request and the spoken alert's own wording. The actual "cleared"
event the feature exists for would never be detected. **Fix:** flip to `durationMinutes <=
watch.threshold_minutes`, and the message to *"Route {from} to {to} just dropped to {N} minutes,
sir — good time to leave."* (per plan's exact spoken example). Tests must be rewritten — the
current ones encode the same inverted assumption ("no alert when duration under threshold",
"triggers alert when duration exceeds/meets threshold") and need to become "no alert when ABOVE
threshold" / "triggers when AT OR BELOW threshold".

### TI-2 · BLOCKER · No interval gating — polls Google Routes every 30s instead of every 15 min
Plan (line 113): *"each tick, if an active watch exists AND `now - last_checked_at >=
interval_minutes` AND `now < expires_at` → one `callGoogleRoutes` call."* `checkRouteWatches()`
has no such gate — it calls `callGoogleRoutes` unconditionally on every invocation, and the
scheduler (`krishna.context.tsx:738`) calls `checkRouteWatches()` on **every 30-second tick**.
With a 15-minute intended interval, this makes **~30 real, billed Google Routes API calls** for
every 1 the plan specifies (quota + cost regression) for as long as a watch is armed (up to 12h).
**Fix:** add the `now - (watch.last_checked_at ?? 0) >= watch.interval_minutes * 60000` gate
(and `now < watch.expires_at`, already handled separately) before the `callGoogleRoutes` call;
return `[]` early otherwise. Add a test: two calls to `checkRouteWatches()` inside the interval
window → only the first hits `callGoogleRoutes`.

### TI-3 · BUG · Expiry never speaks the required close-out line
Plan (line 91): *"On expiry without trigger, speak ONE line: 'The route home never dropped under
40 minutes, sir — watch expired.'"* — explicitly the gotcha-#3 "never let a watch silently
vanish" discipline. Current code on expiry (`now > watch.expires_at`) marks `status: "expired"`
and `return []` — **no alert is ever produced**, so the watch silently vanishes exactly as the
plan says not to let it. **Fix:** on expiry, return a `RouteWatchAlert`-shaped message (or a
distinct `RouteWatchExpiry` type) so the scheduler speaks the close-out line; add a test.

### Minor (non-blocking)
- The scheduler's outer `try { checkRouteWatches() } catch {}` (line 748) is an empty catch —
  low severity since `checkRouteWatches` already catches its own errors internally and increments
  `consecutive_failures`, but if a future change lets an exception escape, it vanishes silently.
  Consider at least a `console.error`.
- No cap on `consecutive_failures` — a watch with a permanently broken address would poll forever
  until natural expiry. Not urgent (max 12h expiry bounds the damage) but worth a note for P5/future.

**Verdict: fix TI-1 + TI-2 + TI-3 on the same branch, rewrite the poller tests to match the
corrected trigger direction and add interval-gate + expiry-alert tests, then re-review.**
