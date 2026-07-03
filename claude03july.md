# Claude session log — 2026-07-02 → 03 (architecture v2 + M1.5 voice/latency)

> **Purpose: cold-start file.** A fresh Claude session reads this and resumes with zero
> questions. Companion state also lives in Claude's memory (`m1-5-pipeline-status`,
> `review-not-fix-workflow`, `local-first-architecture`).

## Working model (who does what)
- **Vikram (owner):** decisions, live voice testing on his laptop, API keys.
- **Coding agent** (separate tool, currently on a free flash-tier model): writes ALL app
  code, in worktree **`D:\Learning\krishna-m15`**, branch **`feature/m1-5-voice`**. Commits
  `feat(m1.5-p<N>)`/`fix(m1.5-p<N>)`, reports, STOPS for confirmation each phase.
- **Claude (reviewer/architect):** plans, reviews every commit via git-object reads
  (`git show <sha>` from the main checkout — NEVER run commands inside the agent's worktree
  while it's active), writes findings to **`M1_5_REVIEW_FINDINGS.md`**, commits docs to
  **`D:\Learning\krishna`** on **`feature/local-first-p1`**, pushes (safe — releases only
  fire on `v*` tags). Claude edits app code ONLY when Vikram explicitly says so (happened
  once: commit `348f2e0`).
- **Mobile review variant:** when Vikram is out, he runs a Claude Code mobile session with a
  prompt Claude drafts (sha + spec section + "output in chat only, do NOT push"); desktop
  Claude verifies mobile's findings against the diff before merging (worked: caught P6-F1).

## Repo map
- `D:\Learning\krishna` = main checkout, branch `feature/local-first-p1` (docs/findings).
- `D:\Learning\krishna-m15` = agent worktree, branch `feature/m1-5-voice` (all M1.5 code).
- Other worktrees exist (`krishna-agent`, `krishna-agent2`) — other tracks, untouched.
- Remote: github.com/Life2death/krishna — both branches pushed and current.

## 1) Architecture v2 (owner-confirmed via Q&A)
`ARCHITECTURE_V2_PLAN.md`: desktop stays local-first (unchanged); cloud = Turso sync hub +
**tiny always-on worker** (reminders/push/command relay, NO chat path); **mobile =
conversation-only voice terminal** (one tap-to-talk screen, no tabs). Milestone plan docs
all in repo root, all pushed:
- `M1_MOBILE_IMPLEMENTATION_PLAN.md` (conversation-only Android v1; T1 = on-device STT/TTS
  spike decides a possible Kotlin bridge)
- `M2_REMINDERS_TASKS_PLAN.md` (reminders ~70% pre-built; adds tasks table, OS
  notifications, fired-at dedup)
- `M3_CLOUD_WORKER_PUSH_PLAN.md` (~200-line Fly worker, FCM data-only push, claim contract)
- `M4_COMMAND_RELAY_PLAN.md` (encrypted commands table, desktop executes via confirm gate)
- `M1_5_VOICE_PERSONA_LATENCY_PLAN.md` + `M1_5_PHASE3_SPEC.md` (phases; P3 spec kept for
  future)
- builder-os assessed: use its `build-loop-claude-code` skill for the agent if desired;
  in-product skills idea maps to the existing `skills` table (later).

## 2) M1.5 execution history (all commits on feature/m1-5-voice)
- **P0** instrumentation `27d6506` — TurnTiming + dev-space LatencyPanel.
- **P1** persona etiquette `02ac7a1` + fixes `236d1fb` (honorific as setting, narrow
  updateCommandTiming).
- **P2** canned instant replies + filler `c303e7b` + fixes `19e29a5`/`38be5de`/`dc53d74`
  (anchored patterns after the substring-hijack blocker; vitest config restored).
- **P3 DEFERRED by decision** — transport streams at ~10ms/token; sentence-TTS would save
  ~200ms vs ~2s TTFT. Spec retained.
- **P4** prompt caching `4f2e9e8` + fixes `7fe1b6b`/`be4bad8`/`76a7313`/`b34e4f4`/`5b9f47d`
  — stable/volatile split, cache_control on claude template, device TZ, usage capture,
  filler threshold 1500ms + await. **Decision: Anthropic cache stays dormant** (stable
  prefix ~1700 tokens < 2048 min; don't fatten; infra kept). Pre-warm deferred.
- **P6** `9b5cf12` + fixes `bbd1bf0`/`69dea23` — maxOutputTokens voice cap (override-never-
  inject), voiceModel override (voice path only), Honorific + VoiceModel + VoiceMaxTokens
  Settings fields.
- **Brevity hardening `348f2e0` (Claude-authored, owner-authorized):** few-shot example in
  etiquette, final rule 11 (spoken brevity absolute), cap 100→160 (a 100 cap could truncate
  plan JSON — P6-F5), no-raw-URLs clause restored.
- Findings ledger: `M1_5_REVIEW_FINDINGS.md` (P0-F1…P6-N4; every BLOCKER fixed & verified).
  Pattern: nearly every agent phase shipped one blocker; review caught all of them.

## 3) Live-test results (owner's laptop, Haiku as provider model)
- Baseline (Sonnet): time-to-first-word ~2.1–2.5s (TTFT-dominated), TTS 15–45s monologues.
- **Haiku A/B: Send→1st ~1.0–1.3s vs Sonnet 2.0–5.7s — Haiku halves TTFT**, recommended for
  voice. Vikram's provider MODEL is currently `claude-haiku-4-5` (was already set).
- Canned path: bare greetings answer <500ms offline. Persona/"sir"/ack-then-act confirmed.
- Cache column works (shows 0/0 = correctly dormant).
- After 69dea23: simple questions brief (7.6s TTS) but broad ones still 27–30s → hence
  `348f2e0` (not yet retested — see PENDING #1).

## 4) Maps / travel tool
- `TRAVEL_TIME_TOOL_PLAN.md`: **v1 = Ola Maps** (India-first, ~500K–5M free calls/mo, no
  card) — traffic-aware directions incl. two-wheeler, geocoding; T1 starts by pinning exact
  endpoints from live Ola docs. TomTom rejected (India coverage), Mappls rejected for now
  (opaque free tier, ~$300/mo entry), Google = future transit adapter.
- **Google Routes key: WORKS** (live-tested: Gateway→CST 850s vs 795s static) and is stored
  in **Windows PasswordVault**, resource `"Krishna"`, name `"GOOGLE_MAPS_API_KEY"`.
  ⚠️ The key was exposed in chat — **Vikram must regenerate it** in Google Cloud console and
  re-vault (retrieve/save PowerShell snippets are in the chat history; pattern: PasswordVault
  via WinRT, never print the key).
- **Ola Maps key: NOT yet obtained.** When Vikram vaults it as `"OLA_MAPS_API_KEY"` and says
  "saved", Claude live-tests it from the vault (in-memory, never printed).

## 5) Parked / other
- `ORNITH_INTEGRATION_PLAN.md`: PARKED — laptop (Ryzen 3 3200U, Vega 3, 18GB, no dGPU)
  cannot run local LLMs; unblock = discrete GPU ≥12GB. Mode A (tiered coding agent) trial
  design inside.
- Owner laptop specs recorded above (relevant to any "run local model" idea).
- Agent quality note: free flash-tier model → expect a blocker per phase; review pipeline
  absorbs it; suggest stronger model if a phase loops.

## PENDING (ordered)
1. **Owner retest of 348f2e0** (M1.5 finish line). Steps: `cd D:\Learning\krishna-m15` →
   `npm run tauri dev` → **Settings → Voice Max Tokens → set 160** (old 100 persists in
   localStorage; new default can't override) → speak: "what can you help me with?" (acid
   test: 2 sentences + offer, ~5–8s), "tell me something interesting about space.",
   "open Chrome and search for lofi music" (**command turn — verifies plans survive the
   cap**, P6-F5 watch item). Pass ⇒ M1.5 DONE → write the closing before/after report card.
2. **P6-F4 (needs repro):** TTS occasionally too fast to understand — capture turn,
   transcript, and whether a filler played just before.
3. Open NITs (fold into future commits): P6-N4 *(done in 348f2e0)*, P0-F3 (STT stage
   unmeasured), P1-F5 (seed edits inert on existing installs), P6-F2 note (brain's
   pre-existing tsc error, non-blocking).
4. **Travel tool build** (`TRAVEL_TIME_TOOL_PLAN.md`) — needs Ola key from Vikram; agent
   does T1–T4 with the usual phase protocol; also fold the P6-F4/N items above.
5. **Google key regeneration** (security hygiene, Vikram).
6. Then the bigger roadmap: M1 mobile (conversation-only Android) → M2 → M3 → M4;
   Phase 5 (language matching) of M1.5 still unbuilt — schedule with M1 mobile since it
   touches the same TTS voice selection.

## How to resume (for a fresh Claude session)
Read this file + `M1_5_REVIEW_FINDINGS.md`. Check `git log --oneline feature/m1-5-voice -5`
for anything new since `348f2e0`; review new commits via `git show` (never run inside the
agent worktree while it's active); update the findings file; commit+push docs on
`feature/local-first-p1`. If Vikram pastes a test table: newest rows are at the top;
E→Send/Send→1st/1st→Audio/Tokens/Cache/TTS/Total columns; TTS ≤10s and Send→1st ~1s are the
current pass bars.
