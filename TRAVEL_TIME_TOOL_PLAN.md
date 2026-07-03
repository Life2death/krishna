# Travel-time tool — "how long from home to work?" — implementation plan

> **For the implementing agent.** Owner-priority feature. **v1 = Google Routes ONLY, English
> only** (updated 2026-07-03). Ola Maps is NOT a provider this tool depends on, automatically
> falls back to, or needs to exist at all — nothing in T1 should assume Ola is present. If
> ever built, Ola is a separate, explicitly user-invoked "second opinion" check (e.g. "what
> does Ola say about this route?"), never a silent substitute for a Google answer. See
> "Ola Maps — optional future comparison check" below; it's reference material, not a task on
> the checklist. Worktree + checkpoints; commit prefix `feat(travel)`; findings loop as usual
> via `M1_5_REVIEW_FINDINGS.md`-style review (reviewer opens a section per commit).
>
> ✅ **Key prerequisite CLEARED 2026-07-03:** the previously exposed Google Routes key was
> regenerated, re-vaulted (`GOOGLE_MAPS_API_KEY`, resource `Krishna`), and live-tested with
> traffic data. The app reads it from secure storage (Settings), not the repo. T4 is
> unblocked on the key front.

## Goal
Spoken, real-time-traffic answers to travel questions: "how long to work?", "home to airport
by bike?", "what's the alternative route?" →
"By car it's about 40 minutes with current traffic, {honorific} — about 10 slower than usual.
The Eastern Expressway route is faster today at 35. The train takes around 55."

## Architecture (fits existing patterns — no new subsystems)
- **New read-only client-side tool `get_travel_time`** in `packages/core/tools/` registered
  like `webSearchTool` (`packages/core/tools/index.ts:36-64`). Read-only ⇒ NOT
  confirmation-gated (`classifyAction` stays untouched).
- **Routing provider abstraction** — keep the small `RoutingProvider` interface
  (`getRoutes({origin, destination, mode, alternatives}) → Route[]`) so the Google adapter
  isn't welded to the tool, but **v1 registers exactly ONE provider: Google Routes.** There
  is NO failover chain and NO secondary provider — if Google fails (quota / error /
  missing key), the tool degrades directly to the URL-open fallback (below). Feature
  degrades, never errors (Principle 4). Do not add Ola to any chain, registry, stub, or
  config path; nothing in the tool may depend on Ola existing.
  - **Google Routes (the provider):** Routes API v2 `computeRoutes`
    (`routes.googleapis.com/directions/v2:computeRoutes`, POST). **T1 first step —** read the
    live Routes v2 docs and pin the exact request body + the required `X-Goog-FieldMask`
    header, `routingPreference: TRAFFIC_AWARE`, the `travelMode` enum used for each mode
    (`DRIVE` / `TWO_WHEELER` / `TRANSIT`), `duration` vs `staticDuration` (traffic delta),
    and how alternative routes + route labels/`description` come back. Do NOT guess these
    from this plan; record them in code comments + tests. Key: `GOOGLE_MAPS_API_KEY`
    (vaulted + live-tested 2026-07-03: Gateway→CST, traffic-aware, working).
  - **English only (owner decision 2026-07-03):** no `languageCode` plumbing, no
    Indian-language localization in this tool — discarded from scope. Don't send a
    `languageCode` field at all; Google's default English strings are fine. (If the app
    grows real multi-language support later, that's a separate pass — noting for the
    record that `LANGUAGES` in `packages/core/response-settings.constants.ts` has zero
    Indian-language entries today.)

### Ola Maps — optional future comparison check (REFERENCE ONLY, not a v1 task)
**Role (owner decision 2026-07-03):** Ola is *not* a fallback and must never silently
substitute for a Google answer. Its only possible future use is an **explicitly user-invoked
second opinion** — e.g. the owner asks "what does Ola Maps say about this journey?" to
sanity-check Google. That would be a separate tool/verb wired up only if ever requested;
treat everything in this subsection as pinned reference material for that day, not work.
Key (if ever needed): `OLA_MAPS_API_KEY` (already vaulted + probe-tested 2026-07-03).
    **Full spec confirmed from Ola's OpenAPI JSON (2026-07-03) — no longer guesswork:**
    `POST https://api.olamaps.io/routing/v1/directions`, query params `origin`/`destination`
    (`lat,lng`, required), `waypoints` (**pipe-`|`-separated** `lat,lng` pairs, up to 25 —
    corrects the earlier comma-encoded guess), `mode` (`driving`|`walking`|`bike`|`auto`,
    default `driving` — maps to our `car`/`two_wheeler`; no direct `transit`, matching the
    earlier assumption that Ola doesn't cover trains), `alternatives` (bool), `steps` (bool,
    default true), `overview` (`full`|`simplified`|`false`, default `full`), `route_preference`
    (`fastest`|`shortest`), `language` (`en`/`hi`/9 more Indian languages), `traffic_metadata`
    (bool — **only returns congestion data when `overview=full`**). Headers `x-request-id` /
    `x-correlation-id` (both optional per the spec, despite earlier examples showing
    `X-Request-Id` — send it anyway for tracing). Response: OSRM/Mapbox-shaped
    `routes[].legs[].steps[]` with `instructions`/`maneuver`/`distance`/`duration`/
    `readable_distance`/`readable_duration`, plus leg-level `distance`/`duration` and an
    `overview_polyline`.
    **Known gap — no clean traffic delta:** unlike Google's `duration` vs `staticDuration`
    pair, Ola has **no `duration_in_traffic` field**. `traffic_metadata=true` (+
    `overview=full`) only adds a `travel_advisory` string of encoded per-segment congestion
    codes (e.g. `"0,1,0 | 1,3,15"`, format undocumented in the spec — schema is silent). Any
    future comparison check must skip the traffic-delta clause for Ola rather than guess at
    decoding it — compare total duration/distance/route only.
    **Known routing-quality risk:** live-probed 2026-07-03 (Gateway of India → CST, default
    `mode=driving`) returned a bizarre 58 km ferry detour instead of the ~5 km direct route —
    not explained by any missing param (driving was already the default). May be a road-graph
    gap for that coastal pair. This is exactly why Ola is a *comparison* check and not a
    fallback: an answer that wrong, spoken silently in Google's place, would be worse than
    the URL-open fallback. Test several pairs + `route_preference=fastest` if ever built.
    **No transit:** Ola has no transit mode — a comparison check covers road modes only.

- **Transit ("by train"):** IN scope via Google `TRANSIT` mode.
- Call via `tauriFetch`, BYOK key.
- **API key = BYOK in secure storage** (`secure_set("GOOGLE_MAPS_API_KEY")`), entered in
  Settings (same section pattern as the ElevenLabs key). Never in code/repo.
  (`OLA_MAPS_API_KEY` is also vaulted but nothing in v1 reads it.)
- **Place resolution order:** (1) confirmed memories — look up keys like "home", "work",
  "home address", "office" via the existing memories repo (strip "address" noise like
  `speech-sanitize.ts` KEY_NOISE does); (2) else pass the raw string as a text query — the
  Routes API accepts address strings, no separate geocoding step needed.
- **No-provider fallback:** if the Google key is missing, OR the Google call fails
  (quota/error), build
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
  interface, the **Google Routes adapter** (sole provider) with request/response mapping,
  spoken-formatting helper. NO Ola stub, NO failover chain, NO languageCode. Unit tests with
  mocked fetch: happy path, traffic delta, alternatives, transit, API error → URL fallback,
  no-key → URL fallback. No UI yet.
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
3. "By bike?" → TWO_WHEELER time. "By train?" → TRANSIT time (via Google).
4. Remove the Google key in Settings → same question opens Maps URL + spoken fallback.
5. Unknown place ("how long to Rahul's place?") → Krishna asks once, remembers, answers.
6. All suites green; no confirmation prompt for travel queries (read-only).

## Cost / key setup (owner)
**Google Routes (the v1 provider):** billed Google Cloud project with the Routes API
enabled → API key. **DONE 2026-07-03:** exposed key regenerated, re-vaulted
(`GOOGLE_MAPS_API_KEY`, resource `Krishna`), and live-tested with traffic data. Routes API
is pay-as-you-go with a monthly free credit; each travel question ≈ 1 call — trivial for
personal use. Restrict the key (API + optionally referrer/IP) in the console.
**Ola Maps:** key already vaulted (`OLA_MAPS_API_KEY`) and probe-tested; unused by v1. Kept
only for the possible future user-invoked comparison check.

## Out of scope (v1)
Ola Maps in any automatic role (fallback/failover/secondary — comparison check only, and
only if the owner asks for it later); Indian-language / any non-English localization
(discarded 2026-07-03 — English only); turn-by-turn navigation; proactive "leave now"
alerts (natural M2/M3 reminder+worker feature later — "leave by 8:20, traffic is heavy"
push); multi-stop routes; scraping Google Maps via browser (brittle + ToS — rejected).
*(Transit/"by train" IS in scope via Google TRANSIT.)*
