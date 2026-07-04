# Travel-time tool review findings

> Written by the reviewer (Claude). Agent: before starting each phase, fix any OPEN
> `BLOCKER`/`BUG` items below and mark them `FIXED (p<N> commit <sha>)` in this file. `NIT`
> items may wait for a convenient phase. This file lives in the MAIN checkout
> (`D:\Learning\krishna`) on **`main`** (branch model updated 2026-07-03 — `main` is now the
> single consolidated hub; `feature/local-first-p1` is archived). Companion spec:
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

### T1-F4 · BLOCKER · FIXED (commit 4d2b08e) — `callGoogleRoutes` uses plain `fetch()`, not the app's CORS-bypass transport
`packages/core/tools/get-travel-time.ts:119` calls `fetch(GOOGLE_ROUTES_BASE, ...)` directly.
Confirmed still present on `main` and on `fix/travel-t4` tip (`5369faf`) as of 2026-07-03.
Every other outbound API call in this codebase (`ai-response.function.ts:194`, both `src/lib`
and `packages/core` copies) goes through `getHttpFetch()` from `packages/core/http.ts`
specifically because the Tauri **webview's plain `fetch()` hits CORS** calling external APIs —
that's the documented reason this transport exists at all. `TRAVEL_TIME_TOOL_PLAN.md` says
"Call via `tauriFetch`" explicitly — not followed. **Consequence: the tool will very likely
fail with a network/CORS error in the live desktop app**, even though unit tests pass (mocked
`fetch` never exercises real browser CORS — this is why T1's "378/378 passed" claim didn't
catch it). **Fix:** replace `fetch(...)` with `getHttpFetch()(...)` in `callGoogleRoutes`
(same call shape as `ai-response.function.ts`'s usage). **Must be verified live** — also check
whether Tauri's CSP/capabilities need `routes.googleapis.com` allow-listed
(`src-tauri/capabilities/*.json` / `tauri.conf.json` `http` scope). Fix this before Vikram's
T4/acceptance retest — otherwise "how long to work?" errors on first live try, and it will
look like a false negative on top of the still-open T4-F2 crash investigation.

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

### T2-N2 · NIT · FIXED (commit 4d2b08e) — "home" default duplicated in two places
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

### T4-F1 · BLOCKER · FIXED (commit 299d0b7, P2) — model claims "saved" without emitting the remember action; nothing verifies persistence
> Fix (reviewer completed P2 after the agent stopped mid-phase): new pure helper
> `detectPhantomSave(userCommand, spokenText, actions)` in `actions.ts` fires when the user
> asked to remember (typo-tolerant) + the reply claims a save + no remember action was
> emitted; the context then speaks an honest correction, records it, AND replaces the false
> claim in `historyRef` so the model doesn't see its own lie next turn. Prompt few-shot +
> CRITICAL "never say saved without the action block" rule added. Two bugs in the agent's
> partial were fixed (history pollution, missing recordTurn). Tests exercise the real helper
> end-to-end (not a re-declared regex — also closes P1-R1's class of gap). 419/419 green.
> **Owner still to re-verify live** (T4 re-run): "remember my home address is X" → confirm
> prompt → yes → row appears in the DB; a phantom save now says "I couldn't save that
> properly."

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

### T4-F2 · BUG · NEEDS-REPRO — hard process crash (exit 0xcfffffff) during the address-save turn
`target\debug\krishna.exe` exited with 0xcfffffff mid-conversation (owner report; terminal
scrollback lost after auto-restart). The same turn produced "Network error during API
request: Unknown error" (now fixed by P3 — code path changed).

**Audit (2026-07-03, P4 phase):** All network paths in `api.rs`/`mobile_bridge.rs`/`tts.rs`
use `?`/`map_err` — zero panic sources. 6 HIGH-risk unwraps found in `speaker/*.rs` (audio
device init + CoreAudio IOProc callbacks) and 25 MEDIUM-risk lock `.unwrap()`s across speaker
modules. The crash was likely in audio/speaker code triggered downstream of error handling,
not directly in the HTTP request path. P3's error-path change (thrown error → catch block
instead of yielding into fullResponse) changes the control flow and may avoid the trigger.

**Panic hook already present** in `lib.rs:68-79` — writes to `krishna-crash.txt` in temp dir.
**P3's fix changes the error path** — the crash may no longer reproduce. Owner to re-test;
if it recurs, share the `krishna-crash.txt` content for targeted fix. Full candidate list
(42 unwrap/expect sites across 6 files) available in the P4 phase report.

### T4-F3 · BUG · FIXED (fix/travel-t4-p3 commit 3132a3c) — raw network errors are spoken verbatim to the user
fetchAIResponse now throws classified errors (__KRNET__/__KRAPI__/__KRPARSE__/__KRSTREAM__)
instead of yielding raw strings into the response stream. The context maps each to a human
sentence: network → "I'm having network trouble, {honorific} — give me a moment and try
again."; API → "The AI service had a problem, {honorific}."; parse/stream → "I had trouble
processing the response, {honorific}." Technical detail goes to logOutcome as ai_error.
Raw errors NEVER enter fullResponse or parseActions.

### T4-F4 · BLOCKER · FIXED (commit 40c3a55) — travel answers are never spoken: the action-result speech filter drops them
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

## T4 fix pass — P1 (commit 40c3a55, reviewed 2026-07-03)

**T4-F4 verified fixed.** The prefix-sniffing speech filter (only "Opening"/"Failed" responses
were spoken) was replaced with an explicit routing system:

1. **`ExecuteActionResult`** now has `kind?: "answer" | "status"` and `ok?: boolean`.
2. **travel_time** returns `kind: "answer"` on every path — the action loop always speaks it,
   records the turn, and logs outcome. `ok` matches the tool's `result.success` flag.
3. **open** returns `kind: "status"` on all paths — spoken only if `!spokenTextRecorded`
   (byte-for-byte same legacy behavior).
4. **No `kind` (legacy/undefined)** falls back to the original prefix heuristic unchanged.
5. **9 new unit tests** verify kind/ok values for travel_time (success, fallback, missing
   args, tool failure, URL open, URL-open failure) and open (URL success, URL failure,
   unknown app). Tested at the `executeAction` level — the layer T2/T3 tests missed.

T4-F4 is the only T4 finding addressed in this pass. T4-F1 (phantom saves), T4-F2 (crash),
and T4-F3 (network errors) remain OPEN for their respective phases.

### Reviewer verdict on P1 (checked against the real diff)
**Core fix is correct — T4-F4 is genuinely resolved.** The `kind`-based routing is sound:
`answer` always speaks + records + logs (ack and answer both spoken, as required); `status`
preserves the `!spokenTextRecorded` gate; the no-`kind` legacy branch is byte-preserving. But
three items, one of which the agent's own summary got backwards:

#### P1-R1 · BUG (test coverage) · FIXED (commits f9bc489 + 299d0b7) — the new tests are at the SAME shallow layer that let T4-F4 through
> `decideActionResponse()` was extracted (f9bc489) as a pure, unit-tested helper for the
> speak/log decision, and `detectPhantomSave()` (299d0b7) is likewise pure and tested
> end-to-end — the P2 test rewrite dropped the re-declared-regex tests for real-helper calls.
> The speak-decision layer that missed T4-F4 is now guarded. (A full context-render test is
> still not present — the pure-helper extraction is the pragmatic substitute given the size
> of `KrishnaProvider`.)

The commit note claims the 9 tests cover "the layer T2/T3 tests missed." That's inverted:
all 9 assert on `executeAction`'s **return value** (`result.kind`/`result.ok`) — which is
*exactly* the layer T2/T3 already tested. The layer that actually missed T4-F4 is the
**context's speak decision** in `krishna.context.tsx` (does `ttsRef.current.speak` fire for a
`kind:"answer"` result?). Nothing added here would fail if that routing regressed again — so
the specific bug we just fixed is still unguarded. **Fix:** add at least one test that
exercises the context routing (or extract the "given a result, should it speak?" decision
into a pure, unit-testable helper and test that a `kind:"answer"` result → speak, a
`kind:"status"` result with a prior ack → no speak). This was the primary test requirement of
P1; it isn't met yet. Not a merge-blocker for proceeding to P2, but MUST close before
`fix/travel-t4` merges.

#### P1-R2 · NIT · FIXED (commit f9bc489) — "couldn't find app" behavior changed (agent claimed "byte-for-byte")
`{ kind: "status", spokenResponse: "I couldn't find an app named X" }`: under the OLD filter
this string started with neither "Opening" nor "Failed", so it was **silently dropped and not
logged**. Now, as `status`, it gets **spoken and logged as `answered`**. The speaking part is
a genuine UX improvement (silence on a missing app was bad) — keep it — but logging a
not-found as `answered` mis-inflates the insights success count (the very thing the old
inline comment guarded against). Consider a `kind:"status"` + `ok:false` → log `tool_failed`
for the not-found path.

#### P1-R3 · NIT · FIXED (commit f9bc489) — travel clarification logged as a failure
`travel_time` with no destination returns `kind:"answer", ok:false` → logged
`failed`/`tool_failed`. But "Where would you like to go?" is a clarifying question, not a tool
failure — it shouldn't count against the failure stats. Minor insight noise; a third
`kind:"prompt"` (speak, log neither answered nor failed) would be cleaner if this pattern
recurs.

## T4-P3 — commit 3132a3c (reviewed 2026-07-03)

Solid pattern: `fetchAIResponse` throws classified `__KRNET__`/`__KRAPI__`/`__KRPARSE__`/
`__KRSTREAM__`-tagged errors instead of yielding raw strings; the context catch block maps
each to an honorific-aware human sentence for TTS/history while `logDetail` (the technical
half after the tag) still reaches `command_log` for diagnostics — exactly the split the plan
asked for. 3 new tests cover HTTP/network/stream failures with tag assertions. No blockers.

### T4-N1 · NIT · FIXED (commit bd644cf) — untagged errors still reach TTS raw ("I had trouble: " + rawMsg)
The `else` fallback in `krishna.context.tsx`'s new mapping speaks `"I had trouble: " + rawMsg`
verbatim for any error that isn't one of the four tags — i.e. this fix narrows the raw-error
surface rather than closing it. Acceptable as an interim safety net (better a labeled
fallback than silently swallowing an unclassified error), but any future throw site that
doesn't use the four tags reintroduces exactly what T4-F3 fixed. **Fix (low priority, fold
into a later pass):** tag the fallback too, e.g. `"Something unexpected went wrong, {hon}."`
with `rawMsg` still going to `logDetail` — never surface a raw exception message in speech.

## T4-P4 — commit 5369faf (reviewed 2026-07-03)
Doc-only status update, correctly follows the plan's repro-first protocol: audited 42
Rust `unwrap`/`expect` sites, found 0 in network paths (ruling out the leading crash
hypothesis), flagged 6 HIGH-risk sites in `speaker/*.rs` for awareness, and marked T4-F2
`NEEDS-REPRO` rather than guessing at a fix — exactly right per the plan's "do not blind-fix"
instruction. No action needed until the crash reproduces (post-P3-merge, since P3 changed the
error path the crash occurred in).

## T4-F5 · BUG (infra, not a T1–T4 code bug) · FIXED (data-only, no commit) — startup crash: "migration 15 was previously applied but has been modified"

**Not the T4-F2 crash** — a separate, unrelated startup panic hit during the 2026-07-04 T4
retest attempt, before the app ever opened. `krishna-crash.txt` (the existing panic hook,
`lib.rs:68-79`) showed: `PluginInitialization("sql", "migration 15 was previously applied but
has been modified")`.

**Root cause, confirmed by direct evidence (not inferred):** `src-tauri/src/db/migrations/
sync-v2.sql` (migration version 15, `fix_text_updated_at_for_sync`) was edited *after* it had
already run against the owner's live DB (`%APPDATA%/com.krishna.assistant/krishna.db`) — a
defensive `CREATE TABLE IF NOT EXISTS voiceprints` clause was added later (good intent: fixes
a fresh-install "no such table: voiceprints" failure), but nobody bumped it to a new migration
number. The Tauri SQL plugin's `_sqlx_migrations` table stores a SHA-384 checksum per applied
migration and refuses to start the app if a previously-applied migration's file content no
longer matches — the exact anti-pattern flagged hypothetically elsewhere in this project's
history (editing shipped migrations vs. adding new ones) actually landed and bit the owner.
Verified precisely: computed SHA-384 of the current `sync-v2.sql` (`9a6872fe...`) against the
recorded checksum for version 15 in `_sqlx_migrations` (`c2940746f3bec6...`) — genuinely
different, not a false alarm.

**Fix applied (owner-authorized, reviewer executed):** `UPDATE _sqlx_migrations SET
checksum=<new SHA-384> WHERE version=15` on the owner's live DB only — read-only-verified
first, single-column write, nothing else touched (memories/conversations/voiceprints
untouched). Migration 15's actual effect (drop trigger, backfill epoch-ms, create-table-if-
not-exists) is idempotent with what's already applied, so accepting the new checksum as
"already done" is correct and safe. No code change was needed or made — the current file
content is fine going forward; only the historical bookkeeping record was stale.

**Process fix (for the agent, next time a migration needs a fix post-merge):** NEVER edit a
migration file under `src-tauri/src/db/migrations/` once it has shipped/been applied anywhere
— add a new migration with the next version number instead, even for a one-line defensive
addition. This will otherwise recur on every other machine (or CI, or a fresh dev environment
that already ran migrations once) that has migration 15 applied from before this edit landed.
No further action needed on `sync-v2.sql` itself; just don't repeat the pattern.

## T4 — owner live retest ROUND 2 (2026-07-04, FAILED again at acceptance item 1, new root cause)

Reviewer verified against the live DB (read-only): **`memories` table = 0 rows** after the
owner's two remember turns; `command_log` shows both turns logged `answered` with the model's
"Saving that now, sir" / "Saved, sir…" prose. Sequence reconstructed from code + owner report
(he repeatedly heard "I'll forget about it." — the literal string at the memory-confirm
timeout, `krishna.context.tsx` ~731/~1353):

### T4-F6 · BLOCKER · FIXED (commit 38afa73) — memory confirmation flow: silent 15s timeout + model narrates success before the save is confirmed → "saved" in chat, 0 rows in DB, `answered` in the log
The remember action WAS emitted this time (so `detectPhantomSave` correctly did not fire —
this is a NEW failure mode, not a T4-F1 regression). The flow that actually happened:
1. Model reply: "Saving that now, sir…" (+ remember action block) — spoken AND logged.
2. App speaks the confirmation question ("Should I remember work address is …?") — **spoken
   only, never logged/recorded anywhere.**
3. Owner has already moved on (typing the next address); no "yes" within 15s.
4. Timeout: `pendingConfirmationRef = null`, app speaks **"I'll forget about it."** — again
   spoken only, no log row, no chat entry, no outcome update.
5. Net state: chat + dashboard say success (`answered`), DB has nothing. The owner only
   discovers via a mystery voice line ("I'll forget about it") with no paper trail. The
   second address then repeated the identical cycle, and the promised travel-time follow-up
   ("Now let me check the travel time for you") was **also never executed** (no travel_time
   action ran or logged) — the model narrated an action it never performed (same
   narrate-without-doing class as T4-F1, but for actions generally, not just saves).
**Fixes needed (layered):**
(a) **Outcome truth:** when a confirmation times out or is declined, UPDATE the originating
    command's `command_log` row (e.g. outcome `declined` / new `timeout`, detail "memory
    confirm timed out") and record the spoken timeout line via recordTurn so chat shows what
    the user heard. A save may only ever be logged `answered` AFTER `addMemory` succeeded
    (grounding rule from T4-F1 extended to the confirm flow).
(b) **Prompt/grounding:** the model must not say "Saving/Saved" when emitting a remember
    action — the action triggers a confirmation the model can't foresee. Teach it to say
    "Let me confirm that with you, sir" (or say nothing and let the confirm flow speak). The
    existing phantom-save few-shot should be extended: narrating a FUTURE action ("Now let me
    check the travel time") that it doesn't emit is the same lie one tense over.
(c) **UX of the confirm window:** 15s expires while the long address is still being read
    back + owner is typing. Consider: accept typed "yes" (if text input routes through
    processCommand), repeat the question once before discarding, and/or shorten the read-back
    (key only: "Should I remember your work address?").
(d) Also verify WHY the owner's follow-up speech didn't resolve the confirm — if he spoke
    during Krishna's TTS, the mic may have been closed (no barge-in on confirm prompts?).

### T4-F7 · FEATURE (owner-requested 2026-07-04) · FIXED (commit 38afa73) — log EVERY spoken utterance to the dashboard, success or failure
Owner: "I want each thing logged in dashboard whether success or failure … what he is reading
there — not only success messages — so I can understand what's wrong and fine-tune it."
Today at least these utterances are TTS-only ghosts (no chat entry, no command_log row):
confirmation prompts ("Should I remember…?", "Should I run the tool/skill…?"), timeout/decline
lines ("I'll forget about it.", "I'll take that as a no."), the 1500ms filler ("One moment…"),
error sentences from the classified-error mapping (logged as detail but not as a spoken-line
record), and some action-result/status lines depending on path.
**Implementation sketch (agent):** create ONE choke point — e.g. `speakLogged(text, meta)` in
`krishna.context.tsx` wrapping `ttsRef.current.speak` — and route EVERY call site through it
(grep shows ~25+ `ttsRef.current.speak(` sites; none may bypass). `meta.source` enum:
`answer | status | confirm_prompt | timeout | decline | filler | canned | error | ack`.
Persist to a new `speech_log` table (id, text, source, related_command_id NULL, created_at)
via migration **v18 — NEW migration file, do NOT edit existing ones (see T4-F5)** — and add a
dashboard panel (pattern: LatencyPanel) listing recent utterances with source + linked
command outcome. Direct `ttsRef.current.speak` becomes lint-forbidden by convention (add a
code comment at the wrapper). This makes every future voice bug self-evident from the
dashboard, which is exactly the owner's ask.

## T4-F7 + T4-F6 completion note (reviewer finished the stalled session's WIP — commit 38afa73, 2026-07-03 night)
A prior Claude Code session started both findings, intertwined them in `krishna.context.tsx`,
and ran out of context ~60% through. Reviewer completed both (owner asked). Landed as ONE
commit (not the instructed one-per-finding) because the F6 decline handler calls the F7
`speakLogged` choke point — they share a file and can't be hunk-split non-interactively.
- **T4-F7 done:** `speech_log` table via NEW migration **v18** (heeds T4-F5 — no shipped
  migration edited); `speech-log.action.ts` (logSpeech/getRecentSpeech/deleteAll + redaction);
  `speakLogged()` choke point with ALL ~35 speak sites routed (only the wrapper's own call
  stays raw); `SpeechLogPanel` in Dev Space (LatencyPanel pattern, colored source tag + linked
  command id).
- **T4-F6 done:** (a) `handleConfirmDecline` choke point across all 9 timeout/decline sites —
  marks `command_log` `declined`, records the line, fixes the mcp_tool hung-promise; (b) prompt
  no longer says "Saving that now" (says "Let me confirm that with you") and forbids narrating
  any un-emitted action; (c) shortened memory read-back so a long address doesn't eat the 15s
  window (re-ask-once + typed-yes already worked).
- Also fixed a **pre-existing** `tsc` error (`actions.ts:170`, from the earlier T2-N2 dedup)
  that meant `bd644cf` didn't compile. Root tsc clean, 421/421 green.
- **Owner still to verify live** (payoff test): save home/work → confirm prompt is SHORT → yes
  → row in DB; then every spoken line (confirm prompts, timeouts, fillers, errors) shows in
  Dev Space → Speech Log. Only `T4-F2` (the crash) remains, still NEEDS-REPRO.

---
*Log format for the agent: change `OPEN` → `FIXED (p<N> commit <sha>)` with a one-line note.*
