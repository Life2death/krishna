# Krishna — Mobile Device Control (Android) — phased plan

**Track:** separate from the local-first phases (see `LOCAL_FIRST_PHASE_3_MOBILE_PLAN.md` — Phase 3
core is chat+memory+sync; this is the "device control" track deferred out of it).
**Scope:** personal use only (single owner, self-installed build). Give Krishna mobile "somewhat
less than desktop" agency: toggle device settings, open apps, maps, place calls, and eventually
converse on a call.

## Architecture principle (applies to every phase)
Do **not** bolt on an external Python agent. Krishna already parses ```action / ```plan blocks and
runs them client-side via its tool registry (`packages/core/executor.ts`). So each capability =
**a new Krishna tool** whose `run()` invokes a **Tauri v2 Kotlin plugin** command (native Android
API / Intent). Reuse the existing device-control plugin work (`ANDROID_ACL_PERMISSIONS_FIX.md`).
Reference for *which* native APIs exist: `termux/termux-api`.

**Test cadence:** each phase ships one small, demoable capability set. Verify by voice/text command
on a real device before starting the next phase. Keep the plugin ACL permissions in lockstep with
each new command.

---

## Phase 0 — Unblock the plugin (prerequisite)
**Goal:** the existing `setTorch` command actually runs on-device.
**Build:** resolve the missing **Tauri v2 ACL permissions** for the inline Kotlin plugin (the known
blocker in `android-device-control-phase1-status`). Establish the pattern: Kotlin command →
`permissions/*.toml` capability → JS `invoke()` → Krishna tool.
**Test:** `invoke('setTorch', {on:true})` toggles the flashlight from the app. Once this round-trips,
the rest is repetition.

## Phase 1 — Flashlight + open app (the "hello world")
**Goal:** "turn on the flashlight", "open WhatsApp".
**Build:**
- Flashlight: `CameraManager.setTorchMode` (already scaffolded — finalize as a Krishna tool).
- Open app: `PackageManager.getLaunchIntentForPackage` / Intent by package or app-alias.
**Krishna wiring:** register `flashlight(on)` and `open_app(name|package)` tools; map friendly names
via the existing app-alias config.
**Test:** voice "open Maps" launches it; "flashlight on/off" works. **Caveat:** none major.

## Phase 2 — Connectivity & settings toggles
**Goal:** Bluetooth, Wi-Fi, location, DND, volume, brightness.
**Build:** use direct APIs where the OS still allows; otherwise open the **Settings panel Intent**
(`Settings.Panel.ACTION_*`, `ACTION_BLUETOOTH_SETTINGS`, etc.).
**Caveat (important):** Android 13+ **blocks silent programmatic toggling** of Bluetooth/Wi-Fi/
location for non-system apps — you launch the toggle panel and the user taps. Volume
(`AudioManager`), DND (`NotificationManager`, needs policy-access grant), and brightness
(`Settings.System`, needs `WRITE_SETTINGS`) are more directly settable.
**Test:** each toggle either flips or opens the correct panel; document which are direct vs panel.

## Phase 3 — Maps & navigation
**Goal:** "navigate to <place>", "find coffee near me", "search hotels in Goa".
**Build:** `geo:0,0?q=<query>` and `google.navigation:q=<dest>` Intents; opens Maps with the search/
route prefilled.
**Krishna wiring:** `maps_search(query)` and `navigate(destination)` tools.
**Test:** commands open Maps at the right place/route. **Caveat:** none major (Intent-based).

## Phase 4 — Telephony: find a number + place a call
**Goal:** "call Mom", "find a hotel in <city> and call them".
**Build:**
- Dial/call: `Intent.ACTION_DIAL` (opens dialer, user hits call — no permission) or `ACTION_CALL`
  (places directly — needs `CALL_PHONE` permission).
- Number discovery: reuse Krishna's **web search/scrape tools** (find hotel → extract phone number).
**Krishna wiring:** `place_call(number)` + a plan that chains web-search → extract number →
`place_call`. Keep a confirm gate before dialing (reuse the client-side `classifyAction` confirm).
**Test:** "call <contact>" dials; "find a hotel in X and call it" researches, confirms the number,
and dials — **you** speak on the call. **Caveat:** `ACTION_CALL` needs runtime permission; start
with `ACTION_DIAL` (safer) then upgrade.

## Phase 5 — GUI-automation fallback (Accessibility)
**Goal:** drive apps that have **no** Intent/API (complete an in-app booking, tap through a flow).
**Build:** an **Accessibility Service** that can read the screen tree + inject taps/swipes/text —
the mobilerun / AppAgent / MobileAgent pattern — driven by Krishna's plan executor (screenshot →
LLM decides next tap → act → verify).
**Krishna wiring:** a `ui_act(step)` tool family behind the accessibility grant; used only when no
native tool exists.
**Test:** one target app, a 2–3 step flow (e.g., open app → search → tap first result). **Caveat:**
needs the Accessibility permission (powerful; user-granted); slower and less reliable than native
tools — always prefer Phases 1–4 when an API exists.

## Phase 6 — Autonomous call assistant (Duplex-style) — personal use
**Goal:** Krishna **places the call and converses** — e.g., asks a hotel for a reservation.
**Build:** real-time loop over the call audio: STT ↔ Claude (dialog) ↔ TTS. Foundations to borrow:
`pipecat-ai/pipecat` or `livekit/agents` patterns. Two routes:
  - **On-device call audio** (harder on Android — capturing/injecting call audio is restricted; may
    need the call on speaker + mic/TTS in the room), or
  - **Telephony provider** (Twilio etc.) where Krishna drives a cloud call leg — cleaner audio, but
    adds a cloud dependency (acceptable here since it's an optional, online-only feature).
**Krishna wiring:** a `call_and_ask(number, goal)` tool that runs the scripted/LLM dialog; start
with a fixed script (greeting + the specific ask), then graduate to free LLM turns.
**Test:** call a known number, do a simple scripted exchange first; then an LLM-driven reservation
ask. **Caveat (personal use, but be aware):** some regions expect disclosure that it's an automated
caller and have call-recording consent rules. You've scoped this personal-use; just be mindful when
calling third parties.

---

## Suggested order & "test small" gates
0 → 1 → 2 → 3 → 4 are quick, native, low-risk — ship and test each in a day-ish. 5 (accessibility)
and 6 (calling) are the heavy, optional stretch phases — only after 0–4 feel solid. Each phase's
acceptance = the "Test" line above passes on a real device, and `tsc` + Android `cargo check` stay
green.

## Out of scope
- iOS (Android first; most of Phases 1–4 have iOS analogues later, but 5–6 differ a lot).
- Anything requiring root.
