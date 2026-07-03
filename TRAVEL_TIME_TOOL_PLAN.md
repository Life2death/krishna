# Travel-time tool — "how long from home to work?" — implementation plan

> **For the implementing agent.** Owner-priority feature. **Provider order updated
> 2026-07-03: Google Routes = primary, Ola Maps = secondary/fallback** (flipped from the
> original Ola-first plan). Worktree + checkpoints; commit prefix `feat(travel)`; findings
> loop as usual via `M1_5_REVIEW_FINDINGS.md`-style review (reviewer opens a section per
> commit).
>
> ⚠️ **Owner prerequisite before T4 live test:** the Google Routes key was exposed in chat
> and MUST be regenerated in Google Cloud console, then re-vaulted. The app reads it from
> secure storage (Settings), not the repo.

## Goal
Spoken, real-time-traffic answers to travel questions: "how long to work?", "home to airport
by bike?", "what's the alternative route?" →
"By car it's about 40 minutes with current traffic, {honorific} — about 10 slower than usual.
The Eastern Expressway route is faster today at 35. The train takes around 55."

## Architecture (fits existing patterns — no new subsystems)
- **New read-only client-side tool `get_travel_time`** in `packages/core/tools/` registered
  like `webSearchTool` (`packages/core/tools/index.ts:36-64`). Read-only ⇒ NOT
  confirmation-gated (`classifyAction` stays untouched).
- **Routing provider abstraction** — an ordered **failover chain** (mirror the AI-provider
  philosophy): `RoutingProvider` interface with `getRoutes({origin, destination, mode,
  alternatives}) → Route[]`. The tool tries providers in priority order and falls through
  on quota / error / missing-key; if every provider fails it degrades to the URL-open
  fallback (below). Feature degrades, never errors (Principle 4).
  **v1 order: (1) Google Routes = primary, (2) Ola Maps (Krutrim) = secondary.** Owner
  decision 2026-07-03 (flipped from Ola-first). Rationale: the Google Routes key is already
  live-tested and working (Gateway→CST, traffic-aware), Google covers car + two-wheeler +
  **transit** in India, and Ola's key isn't provisioned yet. Ola slots in behind the same
  interface as an India-first / large-free-tier cost secondary once its key is vaulted.
  - **Google Routes (PRIMARY):** Routes API v2 `computeRoutes`
    (`routes.googleapis.com/directions/v2:computeRoutes`, POST). **T1 first step —** read the
    live Routes v2 docs and pin the exact request body + the required `X-Goog-FieldMask`
    header, `routingPreference: TRAFFIC_AWARE`, the `travelMode` enum used for each mode
    (`DRIVE` / `TWO_WHEELER` / `TRANSIT`), `duration` vs `staticDuration` (traffic delta),
    and how alternative routes + route labels/`description` come back. Do NOT guess these
    from this plan; record them in code comments + tests. Key: `GOOGLE_MAPS_API_KEY`.
  - **Ola Maps (SECONDARY, added later):** Directions/Routing API at maps.olakrutrim.com
    (+ Geocoding API for address strings). Adds India-first two-wheeler routing and a
    ~500K–5M/mo free tier for cost. Same T1 doc-pinning discipline when built. Key:
    `OLA_MAPS_API_KEY`. Wire the adapter now (behind the interface) but it stays dormant
    until the key is present — do not block T1 on obtaining it.
  - **Transit ("by train"):** now IN scope via Google `TRANSIT` mode (this is the main win
    of going Google-primary). Ola secondary need not cover transit.
  Call via `tauriFetch`, BYOK keys.
- **API keys = BYOK in secure storage**, per provider (`secure_set("GOOGLE_MAPS_API_KEY")`,
  `secure_set("OLA_MAPS_API_KEY")`), entered in Settings (same section pattern as the
  ElevenLabs key). Never in code/repo. The tool uses whichever keys are present, Google
  first.
- **Place resolution order:** (1) confirmed memories — look up keys like "home", "work",
  "home address", "office" via the existing memories repo (strip "address" noise like
  `speech-sanitize.ts` KEY_NOISE does); (2) else pass the raw string as a text query — the
  Routes API accepts address strings, no separate geocoding step needed.
- **No-provider fallback:** if no provider key is configured, OR every configured provider
  fails (quota/error), build
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
- [ ] **T1 — Tool + provider chain + Google adapter + tests.** `get_travel_time` tool,
  `RoutingProvider` interface, the ordered failover chain, the **Google Routes adapter**
  (primary) with request/response mapping, spoken-formatting helper. Stub/register the Ola
  adapter slot behind the interface (dormant without key). Unit tests with mocked fetch:
  happy path, traffic delta, alternatives, transit, API error → chain fallthrough, all-fail
  → no-provider URL fallback. No UI yet.
- [ ] **T1b — Ola adapter (secondary), later.** Implement the Ola Maps adapter behind the
  same interface once the owner vaults `OLA_MAPS_API_KEY`. Pin exact Ola endpoint/fields
  from live docs; tests: Ola used when Google key absent/failing, two-wheeler mapping.
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
3. "By bike?" → TWO_WHEELER time. "By train?" → TRANSIT time (via Google — now in scope).
4. Remove ALL provider keys in Settings → same question opens Maps URL + spoken fallback.
5. (When Ola key is vaulted) invalid/absent Google key but valid Ola key → answer still
   comes back via the Ola secondary — silent failover, no error spoken.
6. Unknown place ("how long to Rahul's place?") → Krishna asks once, remembers, answers.
7. All suites green; no confirmation prompt for travel queries (read-only).

## Cost / key setup (owner)
**Google Routes (v1 primary):** billed Google Cloud project with the Routes API enabled →
API key. Already live-tested and working. **⚠️ Regenerate the exposed key** before the T4
live test and re-vault it, then enter it in Settings. Routes API is pay-as-you-go with a
monthly free credit; each travel question ≈ 1 call — trivial for personal use. Restrict the
key (API + optionally referrer/IP) in the console.
**Ola Maps (v1 secondary, optional):** sign up at maps.olakrutrim.com (Krutrim cloud
console) → create project → API key → vault as `OLA_MAPS_API_KEY`. Free tier ~500K–5M
calls/month, INR billing. Enables India-first two-wheeler routing + a cheap fallback; the
tool works without it (Google-only).

## Out of scope (v1)
Turn-by-turn navigation; proactive "leave now" alerts (natural M2/M3 reminder+worker feature
later — "leave by 8:20, traffic is heavy" push); multi-stop routes; scraping Google Maps via
browser (brittle + ToS — rejected). *(Transit/"by train" is now IN scope via Google TRANSIT.)*
