# Travel-time tool — "how long from home to work?" — implementation plan

> **For the implementing agent.** Owner-priority feature (2026-07-02). Sequence: AFTER the
> current M1.5 queue (P4-F7, P4-F8, Phase 6) — do not interleave with the latency work.
> Worktree + checkpoints; commit prefix `feat(travel)`; findings loop as usual via
> `M1_5_REVIEW_FINDINGS.md`-style review (reviewer will open a section per commit).

## Goal
Spoken, real-time-traffic answers to travel questions: "how long to work?", "home to airport
by bike?", "what's the alternative route?" →
"By car it's about 40 minutes with current traffic, {honorific} — about 10 slower than usual.
The Eastern Expressway route is faster today at 35. The train takes around 55."

## Architecture (fits existing patterns — no new subsystems)
- **New read-only client-side tool `get_travel_time`** in `packages/core/tools/` registered
  like `webSearchTool` (`packages/core/tools/index.ts:36-64`). Read-only ⇒ NOT
  confirmation-gated (`classifyAction` stays untouched).
- **Routing provider abstraction** (mirror the AI-provider philosophy, but code-level is
  fine): `RoutingProvider` interface with `getRoutes({origin, destination, mode,
  alternatives}) → Route[]`.
  **v1 implements Ola Maps (Krutrim)** — owner decision 2026-07-02: India-first data
  (Google billing rejected; TomTom India coverage weak). Docs: maps.olakrutrim.com/docs +
  /apidocs. Use the **Directions/Routing API** with traffic-aware directions,
  `alternatives`, and modes incl. **two-wheeler** (explicitly supported — India-first
  feature), plus the **Geocoding API** for address strings. Free tier ~500K–5M calls/month
  (orders of magnitude beyond need); INR/Indian billing; key from the Krutrim cloud console.
  Call via `tauriFetch`, BYOK key (`KRISHNA_MAPS_API_KEY`).
  **T1 first step:** agent reads the current Ola docs and pins the exact endpoint/param/
  response field names (duration-in-traffic vs base duration, alternative route naming) —
  do NOT guess them from this plan; record them in the code comments + tests.
  **Public transit ("by train"):** verify what Ola's multi-modal support actually covers in
  T1; if absent, Krishna answers road modes and says train schedules aren't available yet.
  **Later adapters behind the same interface:** Google Routes (transit + strongest traffic;
  requires billed account) or Mappls (best India data, enterprise pricing). TomTom rejected
  for India coverage.
- **API key = BYOK in secure storage** (`secure_set("KRISHNA_MAPS_API_KEY")`), entered in
  Settings (same section pattern as ElevenLabs key). Never in code/repo.
- **Place resolution order:** (1) confirmed memories — look up keys like "home", "work",
  "home address", "office" via the existing memories repo (strip "address" noise like
  `speech-sanitize.ts` KEY_NOISE does); (2) else pass the raw string as a text query — the
  Routes API accepts address strings, no separate geocoding step needed.
- **No-key fallback:** if `KRISHNA_MAPS_API_KEY` is absent, build
  `https://www.google.com/maps/dir/?api=1&origin=…&destination=…&travelmode=…`, run the
  existing `open_target`, and speak "I've opened the route on Maps, {honorific}. Add a Maps
  API key in Settings and I can read out times with live traffic." Feature degrades, never
  errors — Principle 4.

## Spoken formatting rules (put in the tool's return, not the LLM's hands)
- Round durations to minutes ("about 40 minutes"); mention traffic delta when
  `duration - staticDuration` ≥ 5 min ("about 10 slower than usual").
- At most ONE alternative spoken (the best one), by road name if the API gives it.
- Transit answer: total time + primary leg ("mostly by train").
- Errors: quota/key invalid → say so briefly + fall back to the URL open.

## Prompt wiring
Extend the tools section (`buildToolsSection`) + action vocabulary (`src/lib/actions.ts`
parse; executor arg mapping) with `travel_time` examples:
- "how long to work" → `{action:"travel_time", from:"home", to:"work", mode:"car"}`
  (default `from`=home when omitted, default mode=car).
- "how long to the airport by bike" → mode two_wheeler.
- Teach the model to ask ONCE if a place is unknown ("I don't have your work address —
  tell me and I'll remember it"), then use the existing remember flow to store it.

## Tasks (each a commit checkpoint)
- [ ] **T1 — Tool + Google adapter + tests.** `get_travel_time` tool, `RoutingProvider`
  interface, Google Routes adapter with request/response mapping, spoken-formatting helper.
  Unit tests with mocked fetch: happy path, traffic delta, alternatives, transit, API error,
  no-key fallback URL building. No UI yet.
- [ ] **T2 — Prompt + executor wiring + place resolution.** Action vocabulary, tools section
  text, memories lookup ("home"/"work" + noise-stripped variants), ask-then-remember flow for
  unknown places. Tests for place resolution incl. Devanagari place names passing through.
- [ ] **T3 — Settings + key storage.** Maps API key field in Settings (secure storage),
  validation ping (1 cheap request), status shown like other provider keys.
- [ ] **T4 — Live acceptance (owner)** — see below — then enable the tool in the M1 mobile
  registry safe-list when M1 lands (read-only tool; note in `M1_MOBILE_IMPLEMENTATION_PLAN.md`
  T5 that `travel_time` joins `remember` as allowed).

## Acceptance (owner, live)
1. "Remember that my home address is X" / "…work address is Y" → stored (existing flow).
2. "How long to work?" → spoken car time with live traffic + delta + one alternative,
   within ~3s of normal turn latency.
3. "By bike?" → TWO_WHEELER time. "By train?" → transit time.
4. Remove the key in Settings → same question opens Maps URL + spoken fallback line.
5. Unknown place ("how long to Rahul's place?") → Krishna asks once, remembers, answers.
6. All suites green; no confirmation prompt for travel queries (read-only).

## Cost / key setup (owner)
**Ola Maps (v1):** sign up at maps.olakrutrim.com (Krutrim cloud console) → create project →
API key. Free tier ~500K–5M calls/month; each travel question ≈ 1–3 calls — unlimited for
personal use. Indian company, INR billing if ever needed.
**Google Routes (later, optional):** only if transit ("by train") answers become must-have
and Ola's multi-modal doesn't cover it — requires a billed Google Cloud project.

## Out of scope (v1)
Turn-by-turn navigation; public-transit ("by train") times — TomTom gap, needs the Google/
HERE adapter later; proactive "leave now" alerts (natural M2/M3 reminder+worker feature
later — "leave by 8:20, traffic is heavy" push); multi-stop routes; scraping Google Maps via
browser (brittle + ToS — rejected).
