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
  **v1 implements TomTom** (owner decision 2026-07-02 — Google billing friction):
  `api.tomtom.com/routing/1/calculateRoute/{origin}:{destination}/json` with `traffic=true`,
  `maxAlternatives=1`, `travelMode` car/motorcycle/pedestrian; geocoding of address strings
  via TomTom Search API (`/search/2/geocode/{query}.json`) when the input isn't lat,lng.
  Free tier: 2,500 non-tile req/day, NO credit card. Call via `tauriFetch`, BYOK key
  (`KRISHNA_MAPS_API_KEY`).
  **Known gap:** TomTom has no public-transit routing — "by train" answers are OUT of v1;
  Krishna should say "I can give road times; train schedules need a Maps upgrade" if asked.
  **Google Routes adapter = later** (adds TRANSIT + India's best traffic) behind the same
  interface, if/when the owner accepts Google billing. Traffic delta comes from TomTom's
  `travelTimeInSeconds` vs `noTrafficTravelTimeInSeconds`.
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
**TomTom (v1):** register at developer.tomtom.com (no card) → create an API key → done.
Free tier 2,500 non-tile requests/day (each travel question ≈ 1 geocode + 1 route ≈ 2–3
requests — hundreds of asks/day headroom). Rate limit 5 req/s — irrelevant at our volume.
**Google Routes (later, optional):** only if transit ("by train") answers become must-have —
requires a billed Google Cloud project ($200/mo credit covers personal use).

## Out of scope (v1)
Turn-by-turn navigation; public-transit ("by train") times — TomTom gap, needs the Google/
HERE adapter later; proactive "leave now" alerts (natural M2/M3 reminder+worker feature
later — "leave by 8:20, traffic is heavy" push); multi-stop routes; scraping Google Maps via
browser (brittle + ToS — rejected).
