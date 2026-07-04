# Travel insights plan — best-departure suggestion + route watch

> Spec for the coding agent. Owner request 2026-07-04. Two user-facing features on top of the
> existing travel-time tool: (A) "when should I leave for work?" — suggest the best departure
> time using traffic predictions; (B) "keep an eye on the work–home route and tell me when it's
> under N minutes" — a background route watch with a spoken alert.
>
> **Branch:** `feat/travel-insights` off `main` (from `D:\Learning\krishna-m15`).
> **Commit prefix:** `feat(trvins-pN)`. **Findings file:** `TRAVEL_INSIGHTS_REVIEW_FINDINGS.md`
> (reviewer creates at first review). One phase per commit, stop and report after each.
>
> **Hard dependency:** pending item 1 (`fix/travel-error-visibility` — the travel tool's empty
> `catch {}` blocks) must land FIRST. Both features below multiply the number of Google Routes
> calls; silent error swallowing multiplied across a sampling loop or a background poller is
> exactly how we end up debugging blind again. Do item 1, get it reviewed, then start P1 here.

## What already exists (do not rebuild)

- `packages/core/tools/get-travel-time.ts` — `callGoogleRoutes()` posts to Google Routes v2
  with `TRAFFIC_AWARE` for car/two-wheeler, pinned field mask, `RouteInfo { duration,
  staticDuration, distanceMeters, ... }`. **It does NOT currently send `departureTime`** — the
  API defaults to "now". That's the one core extension feature A needs.
- Home/work address resolution from memories via the existing place-resolver path — reuse it.
- Reminder scheduler: `krishna.context.tsx` runs a 30-second `setInterval` loop that checks
  `getDueReminders()` and speaks due ones. Feature B's poller piggybacks this loop (with its own
  much longer effective interval) — do NOT add a second interval timer.
- `ExecuteActionResult.kind: "answer" | "status"` — set it correctly (gotcha #2).
- Google key via `getSecret("GOOGLE_MAPS_API_KEY")` (gotcha #1 — app secure store only).

## Feature A — best departure time ("when should I leave?")

### Behaviour
- "When should I leave for work?" / "Suggest a better time to travel to work" →
  ```action
  {"action":"travel_best","from":"home","to":"work","mode":"car","window_hours":3}
  ```
- Krishna samples the route at candidate departure times: **now, then every 30 minutes up to
  `window_hours` ahead (default 3h → max 7 calls, hard cap 8 calls regardless of args)**.
- Spoken result compares best vs now, e.g.:
  *"Leaving now is 58 minutes, sir. If you wait until 9:30 it drops to 41 — that's your best
  window in the next three hours."*
  If now IS the best: *"No better window coming up, sir — now is as good as it gets at 52
  minutes."*
- `data` carries the full sample table (JSON) so the dashboard can chart it later.

### Implementation
- **P1 (core):**
  - `callGoogleRoutes` gains optional `departureTime?: string` (RFC3339, must be strictly in
    the future per Google's API — add a small "now + 60s" floor for the first sample so "now"
    doesn't get rejected as past). Include in body only when set. No field-mask changes needed.
  - New exported `sampleDepartures(params): Promise<DepartureSample[]>` in the same file —
    sequential calls (NOT parallel — be kind to quota and keep abort simple), honors
    `AbortSignal`, and **every per-sample failure is captured into the sample record**
    (`{ departureTime, ok: false, errorReason }`) — never an empty catch. If ALL samples fail,
    throw with the first real reason. If some fail, proceed with the successes and note the
    gap count in `data`.
  - Tests: departureTime present in request body iff set; min-duration selection; "now is
    best" path; partial-failure path keeps going and records reasons; total-failure path
    throws a real reason; cap at 8 samples even if `window_hours: 12` is passed.
- **P2 (tool + action + prompt):**
  - New tool `suggest_departure_time` (KNOWN_SAFE — read-only) wrapping `sampleDepartures`,
    reusing the existing home/work memory-address resolution and the same "address unknown →
    ask once, don't retry" rule the travel tool already follows.
  - Parse `travel_best` in `src/lib/actions.ts` (both `ACTION_REGEX` and `JSON_BLOCK_REGEX`
    paths, same as `travel_time`), execute with `kind: "answer"`, error propagation per the
    G-2 pattern (`result.success ? output : error` — do not reintroduce the swallow).
  - `BASE_SYSTEM_PROMPT`: add 2–3 examples under the existing TRAVEL section (not a new
    section), including one "by bike" mode variant.
  - Tests: parse, execute-success spoken shape, execute-failure surfaces real reason.

### Quota note
7 calls per ask, Routes API essentials tier is fine. Do not add caching in this track —
traffic predictions are time-sensitive; a cache would serve stale answers. (Explicitly
rejected: response caching, parallel fan-out, sampling finer than 30 min.)

## Feature B — route watch ("tell me when it's under 40 minutes")

### Behaviour
- "Keep an eye on the route home and let me know when it's under 40 minutes" →
  ```action
  {"action":"route_watch","from":"work","to":"home","mode":"car","threshold_minutes":40}
  ```
- Krishna arms the watch **instantly** (explicit command → no confirm gate, same owner
  preference as the memory instant-save) but speaks back EXACTLY what was armed, including the
  expiry: *"Watching work to home, sir — I'll speak up the moment it drops under 40 minutes.
  I'll keep watching until 8 o'clock."*
- While armed: poll every **15 minutes** (default; `interval_minutes` arg allowed, floor 10).
- **Trigger (one-shot):** duration ≤ threshold → speak *"Route home just dropped to 38
  minutes, sir — good time to leave."* → mark `triggered`, stop polling. Re-arm requires
  asking again. (Rejected: continuous re-alerting — it would nag every 15 min.)
- **Expiry:** default `now + 4h`, max 12h. On expiry without trigger, speak ONE line: *"The
  route home never dropped under 40 minutes, sir — watch expired."* (Truthful close-out,
  gotcha #3 culture — never let a watch silently vanish.)
- "Stop watching the route" → `{"action":"route_watch_cancel"}` → cancel + confirm verbally.
- **Single active watch.** Arming a new one replaces the old (say so out loud). (Rejected:
  multi-watch management — YAGNI until asked.)

### Implementation
- **P3 (storage + arm/cancel):**
  - Migration: `route_watches` table — `id, origin, destination, mode, threshold_minutes,
    interval_minutes, expires_at, last_checked_at, last_duration_minutes,
    consecutive_failures, status ('active'|'triggered'|'expired'|'cancelled'), created_at`.
    **Migration checksum gotcha:** LF-normalize like the T4-F5 fix required; follow the
    existing migration pattern in `src-tauri` exactly.
  - Repo functions in the existing DB layer pattern (`src/lib/database.ts` / repo-bound).
  - Parse + execute `route_watch` / `route_watch_cancel` actions (`kind: "status"` for the
    arm/cancel acknowledgements). Address resolution reuses the same memory path; unknown
    address → same ask-once rule, do NOT arm a watch with an unresolved address.
  - Prompt: 2 examples in the TRAVEL section, plus the cancel phrasing.
  - Tests: arm→row exists with correct expiry; replace-on-rearm; cancel; unresolved address
    refuses to arm.
- **P4 (poller + alerts):**
  - Extend the existing 30s scheduler loop: each tick, if an `active` watch exists AND
    `now - last_checked_at >= interval_minutes` AND `now < expires_at` → one
    `callGoogleRoutes` (no alternatives, cheapest field mask) → update
    `last_checked_at`/`last_duration_minutes`.
  - Trigger/expiry speech via `speakLogged` (source `"answer"`), audit entry on both, and
    `speech_log`/`command_log` get the truth on every poll failure (`source:"error"`, real
    reason — NEVER spoken raw; the spoken line only exists for trigger/expiry/pause).
  - **Failure policy:** `consecutive_failures >= 3` → pause the watch, speak ONE line
    (*"I've lost the traffic feed for the route watch, sir — I'll stop pestering Google for
    now."*), set status `expired` with the reason in the log. (Rejected: infinite silent
    retry, exponential backoff machinery, circuit breakers — same spirit as the network
    plan's rejected-techniques list.)
  - Tests: due-check math (interval gating), trigger one-shot semantics, expiry speech fires
    once, 3-failure pause, quota math (a 4h watch at 15 min = max 16 calls).

### Laptop-only caveat (documented, not solved here)
The watch only runs while the desktop app is running. That's accepted for v1 — the
ARCHITECTURE_V2 always-on cloud worker is the eventual home for this; do NOT build any cloud
or push component in this track.

## Phase/commit map

| Phase | Commit prefix | Content |
|---|---|---|
| P1 | `feat(trvins-p1)` | `departureTime` + `sampleDepartures` + tests |
| P2 | `feat(trvins-p2)` | `suggest_departure_time` tool, `travel_best` action, prompt, tests |
| P3 | `feat(trvins-p3)` | `route_watches` migration, repo fns, arm/cancel actions, prompt, tests |
| P4 | `feat(trvins-p4)` | scheduler poll, trigger/expiry/pause speech + logging, tests |

`npx tsc --noEmit` clean + full `npx vitest run` green after every phase, then STOP and report.
