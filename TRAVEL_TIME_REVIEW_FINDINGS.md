# Travel-time tool review findings

> Written by the reviewer (Claude). Agent: before starting each phase, fix any OPEN
> `BLOCKER`/`BUG` items below and mark them `FIXED (p<N> commit <sha>)` in this file. `NIT`
> items may wait for a convenient phase. This file lives in the MAIN checkout
> (`D:\Learning\krishna`) on `feature/local-first-p1` — read it from there. Companion spec:
> `TRAVEL_TIME_TOOL_PLAN.md`. One combined file for both process findings and code review —
> do not split into separate documents for this track.

## T1 — commit d598051 (reviewed 2026-07-03)

Overall: clean, correctly scoped — no Ola references anywhere, no `languageCode`, exactly one
provider, matches the plan's field-pinning discipline for the fields it does request. 24
tests, `tsc` clean. Landed on the correct branch this time (`feature/m1-5-voice` only, no
repeat of the P1/P2 branch mixup). Four real findings, ranked by impact.

### T1-F1 · BLOCKER (process, not code) · OPEN — the vaulted key is invisible to the app
The Google Maps key was vaulted via PowerShell/WinRT directly into **Windows Credential
Manager, resource `"Krishna"`** — that's how the owner's earlier live-tests (via PowerShell,
outside the app) confirmed the key itself is valid. But the app's real secret store is a
**completely different mechanism**: `src-tauri/src/secure.rs` — an AES-256-GCM-encrypted
JSON blob (`secure_storage.enc`) in the Tauri app-data dir, keyed by a hash of the machine
UID + a fixed app seed. `getSecret("GOOGLE_MAPS_API_KEY")` (`src/lib/startup.ts:70-77`) calls
the Tauri command `secure_get`, which reads *only* from that encrypted blob — it has no path
to Windows Credential Manager at all.
**Consequence:** `getTravelTimeTool` will call `getSecret`, get `null` back, and **always**
fall through to the URL-open fallback right now — the Google Routes call path is
structurally unreachable until the key is written into the app's real store. T1's code is
correct (matches the existing pattern every other provider key uses); this isn't a code bug.
**Fix (owner, before any live smoke test or T4):** either (a) wait for T3 (adds the Settings
UI field, which calls `secure_set`), or (b) as an interim step, invoke `secure_set` directly
once — e.g. from the app's dev console: `await window.__TAURI__.core.invoke("secure_set",
{key: "GOOGLE_MAPS_API_KEY", value: "<key>"})` — to seed the real store ahead of T3. Do not
assume T1 "works" from the earlier PowerShell live-tests; those only proved the key is valid,
not that the app can find it.

### T1-F2 · BUG · OPEN — fallback message misleads when a key IS configured but the call failed
`getTravelTimeTool.run()`: both the "no key" path and the "key present but `callGoogleRoutes`
threw" path (`packages/core/tools/get-travel-time.ts`, the `catch` block falls through to the
same code) produce the **identical** message: *"I've opened the route on Maps. Add a Maps API
key in Settings and I can read out times with live traffic."* If a valid key is configured and
the call fails for any other reason (quota, transient network error, malformed request,
region not covered), telling the user to "add a key" is factually wrong and will send them on
a pointless trip to Settings. Confirmed intentional-but-wrong, not just an oversight — the
test `"falls back to URL on Google API error"` explicitly asserts the same string for both
cases. **Fix:** distinguish the two cases — at minimum, when `apiKey` was present but the call
threw, use a message that doesn't claim the key is missing (e.g. "I've opened the route on
Maps — the live traffic lookup didn't go through this time.").

### T1-F3 · BUG · OPEN — transit "primary leg" isn't implemented against real Google fields
The plan requires "Transit answer: total time + primary leg ('mostly by train')." The field
mask sent to Google is `routes.duration, routes.staticDuration, routes.distanceMeters,
routes.routeLabels, routes.description` — **none of these are transit-composition fields.**
Google's actual transit-leg/vehicle-type info lives under `routes.legs[].steps[].transitDetails`
(line name, vehicle type, stops), which isn't requested at all. The one transit test
(`"formats transit output"`) passes only because it hand-mocks `description: "mostly by
train — Harbour line"` — an assumption about what Google returns, not something derived from
real transit-specific fields. Unconfirmed whether Google's `description` field ever actually
contains that phrasing for `TRANSIT` mode. **Fix:** before trusting acceptance item 3 ("by
train" via TRANSIT), either add `routes.legs.steps.transitDetails.transitLine.*` to the field
mask and derive "mostly by X" from real vehicle-type data, or run one live transit query
(once T1-F1 is resolved) to see what `description` actually contains for a transit route
before deciding whether the current approach is sufficient.

### T1-N1 · NIT · OPEN — honorific is hardcoded, never threaded from real settings
`run()` calls `formatTravelOutput(routes, mode)` — only 2 args, so `honorific` always
defaults to `"sir"` regardless of the user's configured honorific (`getResponseSettings().
honorific`, used everywhere else per `BASE_SYSTEM_PROMPT`). `ToolContext` (`packages/core/
tools/index.ts`) only carries `vars`/`signal`, no settings access — so this isn't a
ctx-plumbing question, it's a missing import. **Fix:** import `getResponseSettings` (same
source `ai-response.function.ts` uses) inside `get-travel-time.ts` and pass the real
honorific through.

### T1-N2 · NIT · OPEN — `vite.config.ts` indentation broke on the pre-existing alias line
The diff's second `+` line (`"@krishna/core/tools": path.resolve(...)`) lost its leading
6-space indent — cosmetic only, `tsc`/bundler don't care, but run the formatter next commit.

---
*Log format for the agent: change `OPEN` → `FIXED (p<N> commit <sha>)` with a one-line note.*
