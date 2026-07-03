# Travel T4 fix plan — step-by-step (single handover file)

> **For the coding agent.** Fixes every finding from the owner's failed T4 live test
> (2026-07-03). Findings detail: `TRAVEL_TIME_REVIEW_FINDINGS.md` §T4. Reviewer verifies
> each phase against this plan.

## Ground rules (read first)

1. **Branch setup — fresh branch off `main` (owner decision; branches were consolidated):**
   ```
   cd D:\Learning\krishna-m15
   git checkout -b fix/travel-t4 main
   ```
   (Do NOT `git checkout main` itself — main is checked out in the reviewer's worktree
   `D:\Learning\krishna` and git will refuse; branching off it directly works fine.)
   `main` (tip ≥ `c236d7a`) already contains ALL prior work (M1.5, voice-id, travel T1–T3).
   Do NOT build on `feature/m1-5-voice` anymore — it's an archive now.
2. Work ONLY in `D:\Learning\krishna-m15`. Verify before every commit:
   `git branch --show-current` → `fix/travel-t4`.
3. One phase per commit, prefix `fix(travel-t4-pN)`. After each phase: root `tsc --noEmit`
   clean + full vitest green → commit → **STOP and report** (files touched, test counts,
   anything ambiguous). Do not start the next phase without reviewer approval.
4. **No push.** No changes outside the listed files without flagging it in the report.
5. Update `TRAVEL_TIME_REVIEW_FINDINGS.md` statuses (`OPEN` → `FIXED (pN commit <sha>)`)
   as part of each phase's commit.

---

## Phase 1 — T4-F4 BLOCKER: travel answers are never spoken

**Problem.** `src/contexts/krishna.context.tsx` (~line 1691, legacy single-action loop)
only speaks an action result when `result.spokenResponse.startsWith("Opening")` or
`startsWith("Failed")`. Every `travel_time` response ("By car it's about 40 minutes,
{honorific}." / "I've opened the route on Maps — …") matches neither → silently dropped.
The tool's spoken deliverable is unreachable.

**Steps.**
1. In `src/lib/actions.ts`, extend `ExecuteActionResult` with an explicit
   `kind?: "answer" | "status"`.
   - `travel_time` branch: return `kind: "answer"` on every path (success AND both URL
     fallbacks).
   - `open` branch: return `kind: "status"` where responses today start with
     "Opening"/"Failed" (behavior-preserving).
2. In `krishna.context.tsx`'s single-action loop, replace the prefix sniffing:
   - `kind === "answer"` → ALWAYS speak it AND `recordTurn(...)` +
     `logOutcome(command, success ? "answered" : "failed", ...)`. Speak it even when an
     ack was already spoken (`spokenTextRecorded === true`) — for travel_time the ack
     ("I'll check…") and the answer ("By car…") are complementary, both are spoken.
   - `kind === "status"` → keep today's exact behavior (speak only if
     `!spokenTextRecorded`, "Failed…" logs `tool_failed`).
   - No `kind` (legacy/undefined) → fall back to the current prefix heuristic unchanged,
     so nothing else regresses.
3. How does travel_time know success for logOutcome? `executeAction` already sees
   `result.data.fallback === "true" | "false"` from the tool — thread that through
   (fallback URL-open still counts as "answered" if a sentence was spoken; a thrown/empty
   result is "failed").

**Tests (context/integration level — the layer T2/T3 tests missed).**
- travel_time action with mocked tool success → TTS mock receives "By car…" AND
  `logOutcome` records `answered`.
- travel_time with mocked fallback (`fallback:"true"`) → fallback sentence is spoken.
- travel_time when an ack was already spoken → answer is STILL spoken.
- `open` action responses ("Opening chrome…") behave exactly as before (regression).

---

## Phase 2 — T4-F1 BLOCKER: phantom "saved" memories

**Problem.** Owner said "remember my home address is…"; model replied "Your home address
is now saved" WITHOUT emitting the ```action {"action":"remember",...}``` block →
`memories` table stayed empty; user was told a lie. Nothing grounds "saved" claims in an
actual DB write.

**Steps.**
1. **Code-side grounding (the real fix), in the turn-handling path of
   `krishna.context.tsx`:** after `parseActions(fullResponse)`, detect a **claimed-save
   mismatch**: the reply's spokenText matches a save-claim pattern
   (`/\b(saved|I('|)ll remember|remembered|noted)\b/i` — tune to actual phrasing) AND
   `actions` contains NO `remember` action. On mismatch: do NOT speak the model's text;
   speak instead: `"I couldn't save that properly, {honorific} — please tell me once more."`
   and `logOutcome(command, "failed", "tool_failed", "save claimed without remember action")`.
2. **Prompt few-shot** (weak models follow examples, not rules — proven in P6): in the
   REMEMBER section of `BASE_SYSTEM_PROMPT` (`krishna.context.tsx`), add one concrete
   example: user says "remember my home address is X" → assistant emits the action block
   + one short line ("Saving that now, {honorific}."). Add the inverse rule: NEVER say
   "saved"/"remembered" unless the same reply contains the remember action block.
3. Confirm the existing `promptMemoryConfirmation` flow (ask → confirm → `addMemory`)
   still runs when the block IS present — no changes to the happy path.

**Tests.**
- Reply text "Your home address is now saved" + zero actions → mismatch line spoken,
  `tool_failed` logged, nothing written to memories.
- Reply with a proper remember block → confirmation flow triggered (existing behavior).
- Non-memory replies containing the word "saved" in other contexts (e.g. "Ronaldo saved
  the match") → NOT flagged (pattern needs a memory-ish context guard — e.g. only run the
  check when the USER turn matches remember-intent (`/\b(remember|save|note)\b/i`)).

---

## Phase 3 — T4-F3 BUG: raw network errors spoken/stored verbatim

**Problem.** "Network error during API request: Unknown error" (yielded by
`fetchAIResponse`'s catch in `src/lib/functions/ai-response.function.ts`) became the
assistant's stored + spoken reply.

**Steps (minimal now; the full offline UX is `NETWORK_RESILIENCE_PLAN.md`, NOT this pass).**
1. In `fetchAIResponse`, stop yielding raw error prose into the token stream. Yield a
   typed sentinel instead (e.g. `__KRISHNA_ERR__:network` / `:api:<status>`), or throw a
   typed error the caller catches — pick whichever fits the streaming loop with less
   churn, but the raw string must never enter `fullResponse`.
2. In `krishna.context.tsx`, map the sentinel/typed error to a human line before
   speaking/recording: network → `"I'm having network trouble, {honorific} — give me a
   moment and try again."`; api → `"The AI service had a problem, {honorific}."`.
3. Technical detail goes to `logOutcome(..., "failed", "ai_error", <raw detail>)` (the
   `command_log` machinery already exists) — never into the conversation or TTS.

**Tests.** Mocked fetch network failure → human line spoken/recorded, raw string absent
from conversation, `ai_error` + detail in command log. Same for a 500 API error.

---

## Phase 4 — T4-F2 BUG: hard crash 0xcfffffff (REPRO FIRST — do not blind-fix)

**Problem.** `krishna.exe` died with exit 0xcfffffff during the address-save turn (flaky
network at the time). Rust-side panic suspected in a network-failure path.

**Steps.**
1. Do NOT change code first. Add a repro harness: run the app, then simulate failure
   (disable Wi-Fi / firewall-block the provider domain) while issuing a turn; capture the
   full terminal output (`npm run tauri dev > crash.log 2>&1` or `--no-watch` variant).
2. Grep Rust code for panic-capable calls reachable from request handling:
   `unwrap()`/`expect(`/`panic!` in `src-tauri/src/` HTTP-, TTS-, and event-emit paths.
   Report the candidate list with the captured stack/panic line BEFORE fixing.
3. Fix = replace the offending panic with a `Result`/log path. Add `std::panic::set_hook`
   logging (to a file in app-data dir) if the panic is in a spawned thread and otherwise
   invisible.
4. If the crash does NOT reproduce after 1–2 focused attempts, STOP and report — the
   phase then only lands the panic hook + candidate list, and the finding stays
   NEEDS-REPRO.

---

## Phase 5 — small folds (only if phases 1–4 are green; no new scope)

- **T2-N2:** de-duplicate the `"home"` default (keep it in the tool, drop it in
  `actions.ts`, or export a shared const).
- Formatter pass on files already touched.
- Mark all fixed findings in `TRAVEL_TIME_REVIEW_FINDINGS.md`.

---

## Exit criteria (owner re-runs T4 after this)

1. "Remember that my home address is X" → Krishna ASKS to confirm → yes → row visible in
   `memories` (reviewer verifies via read-only SQL).
2. "How long to work?" → SPOKEN answer: time + traffic delta (+ one alternative when
   present) — no silent Maps-only behavior.
3. Kill the network mid-turn → human error line, no raw error text stored/spoken, app
   process stays alive.
4. All suites green; no regression in `open`-action behavior.
