# Ornith-1 × Krishna — integration plan (PARKED: blocked on hardware)

> **Status: PARKED as of 2026-07-02.** Assessed with the owner; both integration modes are
> viable in design but blocked by current hardware. Revisit when a machine with a discrete
> GPU (≥12 GB VRAM) is available, or if hosted inference economics change. Nothing here is
> in the M1.5/M1–M4 critical path.

## What Ornith-1 is
Open-source **agentic coding model** family from deepreinforce-ai
(https://github.com/deepreinforce-ai/Ornith-1), MIT license:
- **9B dense** (single 80GB GPU full-precision; ~8–12 GB VRAM quantized via Ollama/llama.cpp)
- **35B MoE / 397B MoE** (multi-GPU; the "competitive with Opus" benchmark claims are the
  397B — do NOT expect that from the 9B)
- OpenAI-compatible API, 256K context, serving via vLLM / SGLang / Ollama / llama.cpp.
- Tuned for coding benchmarks (SWE-Bench, Terminal-Bench, NL2Repo). NOT a general
  assistant model. "Self-improving" refers to its training-time RL — it does not learn
  after deployment.

## Hardware verdict (owner's laptop, checked 2026-07-02)
Lenovo 81UT · Ryzen 3 3200U (2C/4T) · ~18 GB RAM · integrated Vega 3 (2 GB shared).
**Cannot run Ornith usably**: no discrete GPU; CPU-only quantized 9B ≈ 1–3 tok/s → a single
coding task ≈ an hour of generation; conversational use dramatically slower than the ~2s
cloud TTFT we're optimizing away. RAM suffices to *load* a quantized 9B but compute is the
bottleneck. **Unblock condition: discrete GPU ≥12 GB VRAM (desktop/eGPU), or a hosted
endpoint whose cost the owner accepts.**

## Mode A — Ornith as the coding agent in the dev pipeline (the primary idea)
Division of labor: **builder-os planning skills + Claude (specs, phase gates, review)** →
**Ornith writes the code** → **Claude reviews** (existing `M1_5_REVIEW_FINDINGS.md`-style
loop). The existing pipeline is exactly what makes a weaker coder viable: tight file:line
specs in, adversarial review out.

**Sober calibration:** the current frontier-model agent introduced a blocker/serious bug in
nearly every M1.5 phase (timing clobber P1-F1, canned hijack P2-F1, gutted test config
P2-F5…). A quantized 9B will produce MORE per task — review burden scales inversely with
coder quality. Therefore: **tier by stakes, never wholesale.**

- Critical path (M1.5 phases, M1–M4 milestones): stays with the current agent.
- Ornith trial scope: low-stakes, single-file, mechanical, precisely specced backlog items.

### Trial design (run when unblocked)
1. **Serve:** Ollama with quantized Ornith-9B (`ollama pull` the GGUF or convert), or vLLM
   if on a proper GPU box. Verify tok/s ≥ ~20 before bothering.
2. **Harness:** OpenHands (Ornith README lists integration) pointed at the local endpoint.
   Note: builder-os `build-loop-claude-code` skill does NOT port (it invokes Claude Code's
   `/review`); the phase protocol must be enforced via the task prompt instead. builder-os
   *planning* skills are harness-agnostic (markdown out) and fine.
3. **Tasks (2–3 from the standing backlog):** P0-F3 (plumb real speech-end timestamp into
   `processCommand`), P1-F5 (seed-persona upsert/dedup), P1-F8 (honorific settings UI
   field), or new test-writing tasks. Each gets a Claude-written spec with file:line refs.
4. **Review:** Claude reviews each diff exactly like the agent's commits (git-object reads,
   findings file).
5. **Pass/fail metric:** bugs-per-task vs. the current agent's track record, and wall-clock
   per task (generation + fix cycles). If bugs/task ≤ current agent on mechanical work →
   expand to test-writing + mechanical refactors. If not → drop it, the experiment cost
   2–3 evenings.

## Mode B — Ornith as Krishna's local brain (secondary, weaker case)
Technically trivial: Krishna's provider registry is curl-template based
(`packages/core/functions/../ai-providers.constants.ts`, all `streaming: true`) and Ornith
serves OpenAI-compatible SSE — **one provider entry** pointing at a local endpoint, and the
Phase-6 "model as a setting" work makes A/B free.

Pros: true offline chat (closes the last external call), zero API cost, no network TTFT.
Cons (why this is secondary): coding-tuned 9B will likely fumble the persona etiquette,
Hindi/Marathi mirroring, and especially the custom ```action/```plan block dialect
(malformed blocks silently break actions); phones can't run it, so mobile would need the
laptop as a runtime dependency — contradicting `ARCHITECTURE_V2_PLAN.md` Tier 3 (each
device → Anthropic directly).

### Mode B evaluation gates (if ever tried)
1. Block-protocol compliance: 20 canned commands → % well-formed ```action/```plan blocks.
2. Hindi/Marathi reply quality on the etiquette prompts.
3. TTFT + tok/s on the LatencyPanel vs. the cloud baseline (see BASELINE section in
   `M1_5_REVIEW_FINDINGS.md`).
Fail any → local model stays a dev-space curiosity, not a shipping mode.

## Related docs
- `M1_5_REVIEW_FINDINGS.md` — baseline numbers + the agent quality track record cited above.
- `M1_5_VOICE_PERSONA_LATENCY_PLAN.md`, `M1_5_PHASE3_SPEC.md` — the latency work that must
  not be disrupted by any of this.
- builder-os: https://github.com/BuildGreatProducts/builder-os (planning skills reusable;
  build-loop is Claude Code-specific).
