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

## Phase 3 — Self-learning actions ✅ DONE
Removes the static-map ceiling. Unknown target → **resolution pipeline** (learned-store →
Windows registry → Start-Menu → PATH → LLM-proposes/Rust-verifies) → **ask once** → **remember**.
Self-healing on broken paths; everything visible/forgettable in settings.

**Capability:** *"Hey Krishna, open Mozilla Firefox"* (never configured) → finds it, asks,
remembers, instant next time.
→ Full spec: `PHASE_3_self_learning.md`

## Phase 4 — Multi-step task agent ✅ DONE
The brain becomes a **planner + tool-user**. A goal decomposes into an ordered, typed
**step-plan**, confirmed by voice, executed preferring **reliable deep-links over GUI
puppeteering**. Confirmed plans are saved as reusable **skills (recipes)**.

**Capability:** *"Hey Krishna, play this song on YouTube"* → "I'll search YouTube and play the
top result, ok?" → does it; offers to remember it as a skill.
→ Full spec: `PHASE_4_task_agent.md`

## Phase 5 — Memory, Perception, Trust, Proactivity ✅ DONE

| Pillar | What |
|--------|------|
| 5a — Memory | Conversation history buffer (8 messages), personal memories table (v9), remember intents, memory injection into system prompt, undo |
| 5.3a — Perception | "What's on my screen" → screen capture → AI vision description |
| 5.3b — Trust | Audit log (v10), permission tiers (`classifyAction`), undo handler, central logging |
| 5.3c — Proactivity | Reminders (v11), scheduler (30s), recurrence, routines |

**Capability:** *"What's on my screen?", "Remember my city is Pune" → "Undo that", "Remind me in 1 minute to stretch"*
→ Full spec: `PHASE_5_memory_context.md`, `PHASE_5_REMAINING_handoff.md`

## Phase 6 — Future 🌱 NEXT
- Multilingual voice support (beyond English)
- Richer proactivity (email/calendar integration)
- Improved natural TTS voices (cloud options)
- Cross-app workflows

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
