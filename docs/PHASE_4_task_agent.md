# Krishna — Phase 4: Multi-Step Task Agent (design + plan)

## Context

Phases 1–3 let Krishna talk, open a known thing, and *learn new targets* ("open Firefox").
But real assistant requests are **multi-step and goal-shaped**: *"play this song on YouTube"*
implies open a browser → go to YouTube → search → play. Phase 4 infuses the AI brain as a
**planner + tool-user** so Krishna decomposes a goal into an ordered plan, **confirms it by
voice**, then executes — preferring the most *reliable* mechanism, not literal GUI clicking.

**Core reframe:** the brain's job is to pick the best mechanism, which is usually **not**
puppeteering Chrome. "Play X on YouTube" collapses to a single deep-link
(`youtube.com/results?search_query=X`) or, for true autoplay, a search-tool call that returns a
video ID → `youtube.com/watch?v=<id>`. Reliable beats flashy.

**Builds on:** Phase 3's confirmation flow (reused for plan approval) and skill registry
(Tier 2 — now realized as saved task recipes).

> ⚠️ **Phase 3 is not runtime-functional yet** (see review, 2026-06-13). It compiles and 120
> unit tests pass, but three contract mismatches — masked by mocks — break the live pipeline.
> **Phase 4 must NOT start until Phase 3's pipeline is verified working in a real `tauri dev`
> run**, because Phase 4 reuses `resolveTarget` and adds many more `invoke` tools + a new
> table, multiplying the same risk class.

---

## Lessons carried from the Phase 3 review (must-fix patterns)

Phase 3's failures were all **contract divergence that unit tests with mocks did not catch.**
Phase 4 adds 5–6 new tools and a `skills` table, so these become *more* dangerous. Apply
these as hard rules:

1. **One source of truth for the Rust↔TS command contract.** Every `invoke("tool", args)` must
   match the Rust `#[tauri::command]` **parameter name** and **return shape** exactly. Phase 3
   broke on `invoke("resolve_app", { input })` vs Rust `resolve_app(name)`, and on TS reading
   `result.found` when Rust returned a bare `Option<ResolvedApp>`/`bool`. For Phase 4, define a
   shared TS interface per tool that mirrors the Rust `Serialize` struct field-for-field, and
   keep arg names identical (snake_case ↔ the JS key).
2. **DB schema and the data-layer DTO must be the same shape.** Phase 3's migration created
   `phrase/canonical_name/action_type` while the TS layer inserted `display_name/input` — so
   every real INSERT/SELECT throws "no such column." For the `skills` table, derive the TS
   `Skill` type and the `INSERT`/`SELECT` column lists from the migration columns; review them
   side-by-side.
3. **Tests must assert against the REAL contract, not an invented one.** Phase 3's
   `resolver.test.ts` mocked `invoke` to return `{ found, target }` — a shape the Rust code
   never produces. At least one test per tool must encode the actual Rust return shape (copy it
   from the `#[derive(Serialize)]` struct), and the migration columns must be exercised by a DB
   test (in-memory sqlite) rather than a fully-mocked DB.
4. **Persist only AFTER user confirmation.** Phase 3 called `saveAndConfirm` *before* the yes/no
   turn, so a "no" still left a row behind. In Phase 4, write a learned skill only on an
   explicit "yes," and on "no" ensure nothing was persisted.
5. **Ship the confirmation safety timeout.** The agreed ~15s timeout (Q1) was never implemented
   — `pendingConfirmationRef` stays set forever, so the next unrelated utterance is mis-read as
   yes/no. Phase 4's plan-confirmation reuses this flow; implement the timeout once, here or as
   a Phase-3 fix, and share it.

**Verification gate (applies to both phases):** a feature is "done" only after a real
`npm run tauri dev` run demonstrates the end-to-end flow on Windows — typecheck + mocked unit
tests passing is necessary but not sufficient.

---

## The mechanism: single-action → tool-using agent loop

Today Krishna emits one JSON action. Phase 4 upgrades the protocol to a **plan of typed
steps**, and gives the brain a small **toolbox** it composes. Because providers are curl/BYOK
(text in/out), function-calling is **emulated via this JSON protocol** (provider-agnostic,
reuses `parseActions`), not each provider's native tool API.

```jsonc
// Brain returns a plan instead of a single open:
{
  "say": "I'll search YouTube for 'Tum Hi Ho' and play the top result.",
  "needsConfirmation": true,
  "plan": [
    { "tool": "youtube_search", "args": { "query": "Tum Hi Ho" }, "out": "videoId" },
    { "tool": "open_target",   "args": { "target": "https://youtube.com/watch?v=${videoId}&autoplay=1" } }
  ]
}
```

### The toolbox (capabilities exposed to the brain)
| Tool | Purpose | Status |
|---|---|---|
| `open_target` | open app/url/file | ✅ exists (Phase 1–2) |
| `resolve_app` | learn/resolve unknown app | ✅ Phase 3 |
| `web_search` / `youtube_search` | query → result/ID (BYOK API) | NEW |
| `navigate_webview` | open URL inside Krishna's own Tauri webview | NEW |
| `inject_js` | run scripted action on an **allowlisted** site | NEW |
| `wait` / `type` / `click` | low-level fallback (fragile tier) | NEW (optional) |

`${videoId}` style placeholders let a step consume a prior step's `out` — a tiny variable
substitution layer in the executor (no general scripting).

---

## Confirmation gate (you asked for this)

Krishna reads the plan back before doing anything (reuses Phase 3's `confirming` state):

> Krishna: *"I'll open YouTube and play 'Tum Hi Ho'. Want me to go ahead?"*
> You: *"Yes."* → executes steps in order, narrating progress (*"Searching… playing now"*).

One yes covers the whole sequence. `needsConfirmation` is forced `true` for any multi-step or
potentially destructive plan; trivial single-opens can stay confirmation-free.

---

## Execution tiers (brain prefers the top, falls back down)

| Tier | Mechanism | Use for | Reliability |
|---|---|---|---|
| **1. Deep-link / URI** | `open_target` with a composed URL or `spotify:search:…` | play/search/open on YouTube, Spotify, Maps, Gmail | ⭐⭐⭐ rock-solid |
| **2. Controlled webview** | open site in **Krishna's own Tauri window**, `inject_js` to fill/click | sites with no deep-link | ⭐⭐ you own the DOM |
| **3. Computer-use** | screenshot + click coordinates (external Chrome) | true GUI-only apps | ⭐ fragile, last resort |

The system prompt instructs the brain to **prefer Tier 1** and only escalate when no deep-link
exists. Tier 2/3 are gated behind a setting and added incrementally.

---

## Worked example — "play this song on YouTube"

**Simple (ship first, Tier 1):**
`youtube_search` is optional — brain composes `open_target("https://youtube.com/results?search_query=<song>")`.
You see the result list; one tap plays. Zero automation, never breaks.

**Full autoplay (Tier 1 + search tool):**
1. `youtube_search({query})` → returns top `videoId` (BYOK YouTube Data API key).
2. `open_target("https://youtube.com/watch?v=${videoId}&autoplay=1")` → plays immediately.
No clicking, no fragile DOM scraping.

---

## How this realizes self-learning (Phase 3 Tier 2)

A **confirmed plan becomes a saved skill (recipe)** — Krishna learns *how to do things*, not
just *what things are*:

```
skill: play_on_youtube(query)
  → youtube_search(query) → open watch?v=${id}&autoplay=1
```
Confirmed once → stored in a `skills` table. Next "play *any* song on YouTube" → Krishna
recognizes the intent, fills the parameter, **skips re-planning**, and just runs it. The AI
brain authors the recipe; you approve; it sticks.

```sql
CREATE TABLE skills (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,            -- "play_on_youtube"
  trigger_examples TEXT,         -- JSON array of phrasings
  params TEXT,                   -- JSON: ["query"]
  plan_template TEXT NOT NULL,   -- JSON plan with ${param}/${out} placeholders
  confirmed_by_user INTEGER DEFAULT 0,
  use_count INTEGER DEFAULT 0,
  created_at INTEGER
);
```

---

## Implementation steps

### 1. Plan protocol + parser — modify `src/lib/actions.ts`, new `src/types/plan.ts`
- Extend `parseActions` → `parsePlan(reply): { say, plan: Step[], needsConfirmation }`.
- Keep backward-compat: a single `open` action still works (wrap as a 1-step plan).

### 2. Tool registry + executor — new `src/lib/tools/` + `src/lib/executor.ts`
- Each tool = `{ name, run(args, ctx) }`. `executor.run(plan)` iterates steps, does `${var}`
  substitution from prior `out` values, narrates progress, stops on error.
- `open_target` wraps the existing hardened Rust command; `youtube_search` calls the BYOK API;
  `navigate_webview`/`inject_js` drive a dedicated Tauri webview window.

### 3. Search tool (BYOK) — new `src/lib/tools/youtube-search.ts`
- YouTube Data API (key in settings) → top videoId. Graceful fallback to the search deep-link
  if no key configured.

### 4. Controlled webview (Tier 2) — new `src-tauri/src/webview.rs` + frontend driver
- `#[tauri::command] open_webview(url)` opens a Krishna-owned window; `inject_js(js)` runs a
  script **only if the URL host is on an allowlist** (`src/config/automation-allowlist.ts`).

### 5. Brain wiring — modify `src/hooks/useKrishna.ts` + system prompt
- New planner system prompt describing the toolbox, the plan JSON schema, and the
  "prefer deep-links" rule.
- After plan parse: if a matching saved skill exists → use it directly; else confirm the
  fresh plan, then on "yes" optionally offer *"Want me to remember this as a skill?"*.

### 6. Skill registry — new `src/hooks/useSkills.ts` + migration
- CRUD over `skills`; match incoming intent against `trigger_examples`/`name`.
- Settings page: list learned skills, edit/forget, like the learned-actions list.

### 7. Tests
- `parsePlan`, variable substitution, executor step ordering + error stop, skill matching,
  allowlist enforcement for `inject_js`. Mock `invoke` and the search API.
- **Contract tests (mandatory, per the Phase 3 lessons):** for every new Rust tool, one test
  must use the tool's *actual* Rust return shape (copied from the `#[derive(Serialize)]`
  struct), and the arg key in `invoke` must match the Rust param name. Add an in-memory sqlite
  test that runs the `skills` migration and a real INSERT/SELECT so schema↔DTO drift is caught.
- A Rust-side `#[cfg(test)]` test per command verifying it deserializes the exact JS arg keys
  the frontend sends.

---

## Guardrails (non-negotiable)
- **Confirmation mandatory** for any multi-step/destructive plan — never silent execution.
- **`inject_js` runs only on an allowlisted domain** — never arbitrary pages (injection hole).
- **Brain proposes, app verifies** — same rule as Phase 3; tool args are validated, paths
  checked, hosts allowlisted before anything runs.
- **Dependency staging:** Tier 1 needs nothing new; `youtube_search` needs one BYOK key;
  Tier 2/3 add real complexity — ship Tier 1 first, gate the rest behind settings.

---

## Verification (end-to-end)
1. "Hey Krishna, play Tum Hi Ho on YouTube" → Krishna says the plan, you say "yes", the song
   plays (Tier 1 deep-link or search-tool autoplay).
2. Krishna offers to remember it as a skill → "yes" → row in `skills`.
3. "Hey Krishna, play <different song> on YouTube" → no re-planning, plays directly.
4. A no-deep-link request escalates to the controlled webview (Tier 2) and `inject_js` only
   fires on an allowlisted host; a non-allowlisted host is refused.
5. Settings shows learned skills with edit/forget.
6. `npm run test` green for plan/executor/skill/allowlist units.

## Dependencies on earlier phases
- Reuses Phase 3 **confirmation flow** and the **brain-proposes/app-verifies** discipline.
- Requires the Phase 2 **echo-loop fix** (mic paused while speaking) — multi-step voice
  confirmation is unusable otherwise.
