# Krishna — Roadmap

Krishna is a talking desktop AI assistant built on the Tauri 2 + React stack (forked from
naukri-lelo). Voice in (STT), voice out (TTS), wake word "Hey Krishna", and a growing ability
to *act* on the desktop. This roadmap stitches the phases into one arc.

> **Theme that runs through everything:** the LLM **proposes**, native Rust **verifies**.
> Every capability is inspectable, confirmable by voice, and forgettable.

---

## Phase 1–2 — Voice + basic actions ✅ DONE
- Built-in TTS (`speechSynthesis`), provider-shaped so a cloud voice can drop in later.
- Wake word "Hey Krishna" by matching the existing live STT (no separate engine).
- Single-action protocol: LLM emits ` ```action {"action":"open","target":"…"} ``` `, stripped
  from speech, dispatched to a Rust `open_target`.
- Static seed map of apps/URLs/files (`src/config/app-aliases.ts`).
- **Hardened (commits `201ac98`, `7b11047`):** URLs/paths go through the opener plugin (no
  `cmd` injection), app names gated by `is_safe_app_name`, echo-loop mutex + barge-in, voice/
  rate settings UI, `KrishnaContext` singleton.

**Capability:** *"Hey Krishna, open Chrome / youtube.com / this folder."*

## Phase 3 — Self-learning actions 🔜 NEXT
Removes the static-map ceiling. Unknown target → **resolution pipeline** (learned-store →
Windows registry → Start-Menu → PATH → LLM-proposes/Rust-verifies) → **ask once** → **remember**.
Self-healing on broken paths; everything visible/forgettable in settings.
- Storage: new **version-6** SQLite migration (`learned_actions`), LF-pinned `.sql`.
- Registry via **`windows-registry` v0.5.3** (already in tree). `.lnk`: launch the shortcut
  directly; parse only if needed (pure-Rust `lnk`/`parselnk`, not `IShellLink`).
- Confirmation: event-driven (next utterance = yes/no) + 15s safety timeout.
- LLM tier: setting, default-on, last-resort, **result cached** (one-time cost per app).

**Capability:** *"Hey Krishna, open Mozilla Firefox"* (never configured) → finds it, asks,
remembers, instant next time.
→ Full spec: `PHASE_3_self_learning.md`

## Phase 4 — Multi-step task agent 🔭 LATER
The brain becomes a **planner + tool-user**. A goal decomposes into an ordered, typed
**step-plan**, confirmed by voice, executed preferring **reliable deep-links over GUI
puppeteering**. Confirmed plans are saved as reusable **skills (recipes)** — the self-learning
loop applied to *how to do things*, not just *what things are*.
- Toolbox: `open_target`, `web_search`/`youtube_search` (BYOK), `navigate_webview`+`inject_js`
  (allowlisted), low-level fallback.
- Execution tiers: deep-link → controlled Tauri webview → computer-use (last resort).
- New `skills` table; intent-match skips re-planning.

**Capability:** *"Hey Krishna, play this song on YouTube"* → "I'll search YouTube and play the
top result, ok?" → does it; offers to remember it as a skill.
→ Full spec: `PHASE_4_task_agent.md`

## Tier 2 / beyond 🌱 FUTURE
Genuinely new *verbs* needing new code stay **review-gated PRs**, never runtime
self-modification. Cloud/natural TTS voice. Richer skills (reminders, email, music control),
cross-turn memory.

---

## Dependency chain
```
Phase 1–2 (hardened base)
   └─► Phase 3  confirmation flow + learned-store + brain-proposes/Rust-verifies
          └─► Phase 4  reuses confirmation flow; learned-store generalizes to skills
```
Phase 4's voice confirmation is unusable without Phase 2's echo-loop fix (✅) and reuses Phase
3's `confirming` state and verification discipline — build in order.

## Non-negotiable guardrails (all phases)
- Confirmation mandatory for multi-step/destructive actions; never silent.
- LLM proposes, Rust verifies (paths exist, hosts allowlisted, app names sanitized).
- `inject_js` only on an allowlisted domain.
- Everything learned is listed in settings with a **Forget** control.
