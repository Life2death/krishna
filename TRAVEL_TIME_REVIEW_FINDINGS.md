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

## T1 fix pass — commit 50e3dce (verified 2026-07-03)
F2/F3/N1/N2 all genuinely fixed, not just claimed — checked the real diff. F3 in particular is
a substantive fix: `deriveTransitSummary()` now walks real
`legs[].steps[].transitDetails.transitLine.vehicle.type` data (matches Google's documented
`RouteTravelMode` enum) instead of relying on a hand-picked mock string; new tests explicitly
assert the two fallback messages differ (one test asserts the API-error case does NOT say
"add key"). 6 new tests (30 total), 378/378 suite green, `tsc` clean. T1-F1 correctly left
open — it's a process/deployment issue (key-store mismatch), not something a code commit
fixes; still needs a `secure_set` seed or T3 before any live call can succeed. **T1 approved
— proceed to T2.**

### T1-F1 · BLOCKER (process, not code) · See note — the vaulted key is invisible to the app
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

### T1-F2 · BUG · FIXED (commit 50e3dce) — fallback message misleads when a key IS configured but the call failed
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

### T1-F3 · BUG · FIXED (commit 50e3dce) — transit "primary leg" isn't implemented against real Google fields
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

### T1-N1 · NIT · FIXED (commit 50e3dce) — honorific is hardcoded, never threaded from real settings
`run()` calls `formatTravelOutput(routes, mode)` — only 2 args, so `honorific` always
defaults to `"sir"` regardless of the user's configured honorific (`getResponseSettings().
honorific`, used everywhere else per `BASE_SYSTEM_PROMPT`). `ToolContext` (`packages/core/
tools/index.ts`) only carries `vars`/`signal`, no settings access — so this isn't a
ctx-plumbing question, it's a missing import. **Fix:** import `getResponseSettings` (same
source `ai-response.function.ts` uses) inside `get-travel-time.ts` and pass the real
honorific through.

### T1-N2 · NIT · FIXED (commit 50e3dce) — `vite.config.ts` indentation broke on the pre-existing alias line
The diff's second `+` line (`"@krishna/core/tools": path.resolve(...)`) lost its leading
6-space indent — cosmetic only, `tsc`/bundler don't care, but run the formatter next commit.

## T2 — commit 80dbc7a (reviewed 2026-07-03)

Overall: place resolution, action-vocabulary/prompt wiring, and action parsing are all clean
and correctly scoped to the plan — `resolvePlace()` matches spec exactly (exact key match →
noise-stripped match → pass-through), `travel_time` correctly added to `KNOWN_SAFE`, new
tests are well-targeted. One significant finding that goes beyond T2's stated scope and needs
attention before T3/T4; two minor NITs.

### T2-F1 · BLOCKER · FIXED (commit 1922f38) — new plan-level confirmation bypass isn't scoped to travel_time and can skip the Voice-ID unverified-speaker gate
`krishna.context.tsx`, inside the plan-handling branch: a new `if (plan.needsConfirmation ===
false) { ... executePlan(...); return; }` fast path was added, inserted **before** the
pre-existing `isUnverified`/`hasSensitiveStep` check that normally forces confirmation. This
is a general plan-execution change, not something scoped to `get_travel_time` — it applies to
*any* multi-step plan the model emits.
**Why this matters:**
1. `SYSTEM_PROMPT_RULES` rule 3 (unchanged by this commit) still says **"Always set
   `needsConfirmation`: true for multi-step plans."** The new travel-time prompt section also
   tells the model to emit travel_time as a single `action` block, not a `plan` — so today,
   under normal model behavior, this path shouldn't trigger at all. It was added without any
   prompt instruction that would ever produce `needsConfirmation: false`, and isn't requested
   anywhere in `TRAVEL_TIME_TOOL_PLAN.md`'s T2 scope (place resolution + prompt wiring +
   ask-once-remember only).
2. The flag is **fully model-self-attested with zero code-side enforcement** —
   `src/lib/actions.ts:23`: `needsConfirmation: parsed.needsConfirmation !== false` takes the
   raw parsed JSON at face value. Nothing cross-checks the plan's actual step composition
   against this claim.
3. `executePlan()` (`packages/core/executor.ts:53-63`) does still reject any step whose tool
   `classifyAction()`s as `"sensitive"` — so this isn't a full bypass of all safety. But
   `KNOWN_SAFE` already includes `open_target` and `memory_write` (pre-existing, not added by
   this commit) alongside the new `get_travel_time`. If the model ever emits
   `needsConfirmation: false` on a plan built entirely from `KNOWN_SAFE` tools — whether by
   hallucination, an edge-case phrasing, or simply not perfectly following rule 3 (this
   project's own notes flag the driving model as a "free flash-tier model" prone to one
   blocker per phase) — that plan runs **immediately, with no spoken confirmation, and
   without ever checking whether the current speaker is Voice-ID-verified.** That directly
   defeats the Voice ID feature's stated purpose ("unverified speakers are asked to confirm
   before executing any action," per `VoiceIdSettings.tsx`'s own description text) for
   exactly the tool combination (`open_target`, `memory_write`) where an unverified/impostor
   speaker skipping confirmation is most worth preventing.
**Fix, in order of preference:** (a) simplest — remove the fast path entirely; T2's actual
requirement (no confirmation for read-only travel_time) is already satisfied correctly via
the single-`action` path (`KNOWN_SAFE` + `resolveActionForConfirm` gated on `isUnverified`),
so this fast path isn't needed to hit the plan's acceptance criteria. (b) if a plan-level
fast path is genuinely wanted for a future case, it must AND together with the existing
`isUnverified` check (never skip on an unverified speaker, no matter what the model claims),
and should re-validate every step is actually `KNOWN_SAFE` in code — not trust the model's
`needsConfirmation` claim alone.

### T2-N1 · NIT · FIXED (commit 1922f38) — dead fallback branch in `actions.ts`'s travel_time executeAction
`spokenResponse: result.output || ("Got it, " + honorific + "." / "I couldn't find a route...")`
— `getTravelTimeTool.run()`'s every return path already sets a non-empty `output` (the
`formatTravelOutput([], ...) === ""` case only happens when `routes.length === 0`, which
`callGoogleRoutes` already turns into a thrown error caught by the URL-fallback branch before
`formatTravelOutput` is ever called with an empty array). So `result.output` is always
truthy in practice — the `||` fallback string is unreachable. Harmless, just dead code; fold
into a cleanup pass.

### T2-N2 · NIT · OPEN — "home" default duplicated in two places
`actions.ts`'s `executeAction` does `const from = action.from || "home";`, and
`get-travel-time.ts`'s `run()` independently does `args.from || args.origin || "home"`. Both
correct individually, but the default now lives in two places that could drift. Not urgent —
note for whenever this file is touched next.

## T3 — commit 1922f38 (reviewed 2026-07-03)

Overall: T2-F1/N1 fixes verified genuine (checked the real diff, not just the claim — see
below). New `MapsSettings.tsx` correctly wired and, importantly, **T1-F1 is now genuinely
resolved**: traced `secureStorage.set/get` → `invoke("secure_set"/"secure_get")` → the same
Tauri commands `getSecret` reads from (`src-tauri/src/secure.rs`) — once a key is pasted into
Settings → Maps, `getTravelTimeTool` will actually find it. One SHA correction, one
downgraded/reframed finding, no new blockers.

**T2-F1 verified fixed:** the entire `if (plan.needsConfirmation === false) { ... }` block is
cleanly removed from `krishna.context.tsx` — all plans now unconditionally go through the
original `pendingConfirmationRef` flow again, so the Voice-ID `isUnverified` check applies to
every plan as before. Full revert-style fix, exactly option (a) from the T2 review. *(Ledger
correction: this file briefly cited commit `80dbc7a` — that's the commit that introduced the
bug, not the fix. Corrected above to `1922f38`, the actual fix commit.)*

**T2-N1 verified fixed:** simplified to a flat `"I couldn't find a route."` string, dropping
the never-reached honorific-interpolating ternary. Reasonable simplification of confirmed
dead code.

### T3-N1 · NIT (downgraded from a suspected gap) · OPEN — no live "validation ping" against the plan's literal wording, but this matches the codebase's actual existing pattern
`TRAVEL_TIME_TOOL_PLAN.md`'s T3 line asks for "validation ping (1 cheap request)." What
`MapsSettings.tsx` does instead is a **storage round-trip check** — write via `secureStorage.
set`, then immediately `secureStorage.get` to confirm the write persisted — not a real call to
Google's Routes API to confirm the key itself is valid. Checked whether this is a shortcut
against house style: it is not — `Integrations.tsx` (GitHub PAT), the exact component this
was explicitly modeled on, does **the identical thing** (save → read-back → persistence
check, no live GitHub API call either). So this isn't a corner cut by the agent; it's that no
provider-key field in this codebase does real validation yet, and the plan's wording (mine)
assumed a stricter existing pattern than actually exists. **Consequence if left as-is:** a
typo'd or expired key gets a green "✓ API key configured" checkmark and silently degrades to
the URL fallback on first real use, with no signal pointing at the key being the problem.
**Suggested fix (not urgent, batch with Integrations.tsx if ever done):** add a real one-call
validation ping to both `MapsSettings` and `Integrations` together, for consistency — doing
it for Maps alone would create a fresh inconsistency between two visually-identical
components.

### T3-N2 · NIT · OPEN — no test file for `MapsSettings.tsx`
Zero new tests in this commit (flat at 390, same as after T2). Matches existing precedent —
`Integrations.tsx` also has no test file — so not a new gap, just noting it stays uncovered.

**Status: T1, T2, T3 all reviewed and approved.** Module is feature-complete per the plan
(minus the intentionally-out-of-scope Ola comparison check). Only T4 (owner's live
acceptance test) remains, and it's unblocked now that the key-store path works end-to-end.

## T4 — owner live test, first attempt (2026-07-03, FAILED at acceptance item 1)

Environment note: owner's network was flaky during the whole run — that interacts with
several findings below.

### T4-F1 · BLOCKER · OPEN — model claims "saved" without emitting the remember action; nothing verifies persistence
Reviewer queried the live DB read-only (`%APPDATA%/com.krishna.assistant/krishna.db`):
`memories` table has **0 rows** — yet the message log shows the assistant answering "Your
home address is now saved" and "Your office address is now saved" to the owner's two
remember requests. The model spoke success prose WITHOUT emitting the ```action
{"action":"remember",...}``` block, so `promptMemoryConfirmation` never ran and nothing hit
the DB. The subsequent "how much time to travel to work?" then had no memory to resolve —
`resolvePlace` passed raw "home"/"work" strings to Google. Two layered fixes needed:
1. **Prompt:** strengthen the REMEMBER section — the model must NEVER say "saved" unless it
   emitted the action block in the same reply (few-shot example; weak models follow examples,
   not rules — proven by the P6 brevity saga).
2. **Code-side verification (the real fix):** after a turn whose user text matches remember
   intent (or whose reply claims saving), if `parseActions` produced NO remember action,
   either re-ask or at minimum never speak the model's "saved" claim. Persistence claims must
   be grounded in an actual `addMemory` result, not model prose.

### T4-F2 · BUG · OPEN — hard process crash (exit 0xcfffffff) during the address-save turn
`target\debug\krishna.exe` exited with 0xcfffffff mid-conversation (owner report; terminal
scrollback lost after auto-restart). Rust-side crash, plausibly in a network-failure path
(the same turn produced "Network error during API request: Unknown error"). Needs repro with
terminal capture; treat any panic reachable from a failed HTTP request as the prime suspect.

### T4-F3 · BUG · OPEN — raw network errors are spoken verbatim to the user
"Network error during API request: Unknown error" was stored (and likely spoken) as the
assistant's reply. Ties into `NETWORK_RESILIENCE_PLAN.md` (new doc, same date): errors must
map to a human sentence ("I'm having network trouble, {honorific} — check the connection")
and offline state should be announced once, not per-turn.

### T4-F4 · BLOCKER · OPEN — travel answers are never spoken: the action-result speech filter drops them
Owner report: "how much time to travel to work?" → Krishna spoke only the ack, then silently
opened the Maps page. Root cause in `src/contexts/krishna.context.tsx` (~line 1691, legacy
single-action path):
```ts
const isStatus = result.spokenResponse.startsWith("Opening") || result.spokenResponse.startsWith("Failed");
if (isStatus && !spokenTextRecorded) { ...speak... }
```
Action results are ONLY spoken when they start with "Opening" or "Failed" — a prefix
heuristic built for the old `open` action. Every travel_time response ("By car it's about 40
minutes, {honorific}." / "I've opened the route on Maps — the live traffic lookup didn't go
through this time, {honorific}.") matches neither prefix and is **silently discarded**. This
means even a fully successful Google call would never be heard — the tool's core deliverable
(spoken travel times) is unreachable on the voice path. T4 acceptance item 2 cannot pass
until this is fixed. The T2/T3 unit tests missed it because they stop at
`executeAction`'s return value; nothing tests the context's speak decision.
**Fix:** stop inferring "should this be spoken" from string prefixes. Have `executeAction`
return an explicit flag (e.g. `speak: true` / `kind: "answer" | "status"`) and speak
whenever `spokenResponse` is a user-facing answer. At minimum: travel_time results must
always be spoken (and recorded via recordTurn + logOutcome "answered"/"tool_failed" like the
status path does). Also decide the interaction with a prior ack (`spokenTextRecorded`) —
for travel_time the ack ("I'll check…") and the answer ("By car…") are complementary and
BOTH should be spoken.

---
*Log format for the agent: change `OPEN` → `FIXED (p<N> commit <sha>)` with a one-line note.*
