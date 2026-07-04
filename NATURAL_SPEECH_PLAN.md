# Natural speech plan — variety engine + owner-learned voice lines

> Spec for the coding agent. Owner request 2026-07-04: Krishna says "one minute sir" (and
> other fixed lines) identically every time and sounds robotic. Goal: varied, natural,
> personal wording — learned from the owner where possible, never the same line twice in a
> row — WITHOUT adding latency to the ack-then-act flow.
>
> **Branch:** `feat/natural-speech` off `main`. **Commit prefix:** `feat(speech-vN)`.
> **Findings file:** `NATURAL_SPEECH_REVIEW_FINDINGS.md`. One phase per commit, stop + report.

## Diagnosed root causes (verified in code 2026-07-04 — fix all three, not just one)

1. **Hardcoded filler:** `krishna.context.tsx:1720` — `speakLogged("One moment, " + honorific,
   "filler")` is a single fixed string spoken on every LLM wait. THE main offender.
2. **Prompt example parroting:** `BASE_SYSTEM_PROMPT` (ACKNOWLEDGE-THEN-ACT rule) and
   `seed-personas.ts` each give exactly ONE example ack ("On it, {honorific} — give me a
   minute"). The model copies examples verbatim, so LLM acks converge on one sentence.
3. **Tiny pools + repeat-blind random:** `canned-responses.ts` pools are 3–4 lines picked by
   plain `Math.random()` (same line can hit twice in a row), and ~a dozen fixed spoken lines
   are scattered through `krishna.context.tsx` ("I had trouble: ...", "I'll take that as a
   no.", "Okay, I won't do that.", "Sorry, I didn't catch that...", "There's nothing to
   undo.", "Reminder: ...").

## Design: a Style Bank, not more baked strings

One module + one table own every spoken system line. Lines are **data** (seeded, taught by
the owner, or LLM-generated from the owner's own style) — not string literals in code. The
owner's worry "not some words we would bake" is answered by V3/V4: the bank starts seeded but
grows from HIM.

- **Table `voice_lines`:** `id, category, lang ('en'|'hi'|'mr'), text (with {honorific} and
  simple slots like {task}), source ('seed'|'owner'|'llm'), enabled, weight, last_used_at,
  use_count, created_at`.
- **Categories (initial):** `filler_wait` (the "one moment" slot), `ack_quick`,
  `ack_multistep`, `confirm_yes_ack`, `decline_ack`, `reask`, `error_generic`,
  `error_network`, `reminder_intro`, `greeting`, `thanks_reply`, `wake_ack`.
- **Picker with anti-repeat:** `pickLine(category, lang)` — weighted random EXCLUDING the
  last 3 used in that category (ring buffer persisted via `last_used_at`; with pools ≥6 this
  guarantees no back-to-back repeats and no A/B/A/B ping-pong).
- **Time-of-day awareness (cheap, big naturalness win):** optional `tod` tag on lines
  (morning/evening/late-night) — "Bit late, {honorific} — one second." at 1am beats a chirpy
  daytime line. Picker prefers matching-tod lines when any exist, falls back otherwise.

## Phases

### V1 — Style bank + centralize + kill the worst offender
- New `src/lib/voice-lines.ts` (picker + slot filling) + `voice_lines` migration (LF-normalize,
  follow existing migration pattern) + seed data: **8–12 seed variants per category per
  language** (en full; hi/mr at least for greeting/thanks/filler, matching what
  `canned-responses.ts` already covers). Seed lines must vary STRUCTURE, not just synonyms —
  "One sec, {honorific}.", "Right away.", "Hold on — checking.", "Give me a moment,
  {honorific}.", "On it.", "Let me look."
- Replace `krishna.context.tsx:1720` filler and every fixed spoken line found in the audit
  (agent: grep `speakLogged("` and the pendingConfirmation decline/reask strings; list ALL
  replaced call-sites in the phase report) with `pickLine(...)`.
- `canned-responses.ts` pools migrate into the bank (keep the intent-matching regexes where
  they are; only the reply pools move).
- Tests: anti-repeat guarantee (100 picks, no consecutive dupes), slot filling, lang
  fallback (mr→hi→en), disabled lines never picked, tod preference.

### V2 — LLM-side variety (free, prompt-only)
- ACKNOWLEDGE-THEN-ACT rule: give 4–5 stylistically DIFFERENT example acks and add an
  explicit line: *"These are style examples, not scripts — never reuse your previous
  acknowledgment's wording."*
- Ground the anti-repetition in data: inject the last 3 spoken acks (from `speech_log`,
  already exists) into the context as *"Your last acknowledgments were: X / Y / Z — phrase
  this one differently."* Weak-model instruction-following improves hugely when the
  constraint is concrete instead of abstract.
- Same treatment for `seed-personas.ts` (multiple examples + not-a-script line).
- Tests: prompt contains the rule + multiple examples; context builder includes last-acks
  when speech_log has them.

### V3 — Learn from the owner, explicitly (teach + ban by voice)
- "Krishna, stop saying 'one minute sir'" → `{"action":"speech_ban","phrase":"one minute
  sir"}` → disables matching bank lines AND adds the phrase to a small banned list injected
  into the prompt (so the LLM avoids it too). Instant-save (explicit command, same owner
  preference as memory instant-save), spoken confirmation of what was banned.
- "Krishna, sometimes say 'ek minute boss'" → `{"action":"speech_teach","category":
  "filler_wait","text":"Ek minute, boss."}` → inserts with `source:'owner'` and a higher
  weight (owner-taught lines should surface noticeably often). If category is ambiguous from
  the utterance, ask once.
- Settings: a simple "Voice & phrases" list view — see all lines, toggle, delete (management
  UI only; creation is voice-first).
- Tests: ban disables + prompt list, teach inserts + weighting, ambiguous-category ask-once.

### V4 — Learn from the owner, implicitly ("refresh your vocabulary")
- On command ("refresh your vocabulary" / "learn how I talk") — and optionally weekly via the
  existing reminder scheduler — run a **vocabulary refresh**: one LLM call fed with (a) a
  sample of the owner's recent utterances from conversation history (his words, his
  Hindi/English mix, his formality level), (b) the current bank per category, (c) the banned
  list. It proposes ~6 new lines per category **in the owner's register**.
- New lines land as `enabled:false` proposals; Krishna speaks a 1-line summary ("I've drafted
  22 new phrases from how you talk, {honorific} — review them in Settings or say 'accept
  them'") — spoken batch-accept or Settings review flips them on. No silent vocabulary
  changes (truth culture: the owner always knows why Krishna started talking differently).
- Privacy note: this call sends HIS OWN conversation snippets to the LLM already handling
  every turn — no new data exposure. Document that in the plan anyway.
- Tests: proposal parsing/validation (reject lines missing {honorific} slot where category
  requires it, reject banned-phrase collisions), accept flow, disabled-by-default.

## Answers to the owner's direct questions (also summarized in chat)
- **"Can he learn from me?"** Yes — V3 (explicit teach/ban by voice) + V4 (mined from your
  own conversation history, proposals you approve). That's the natural path.
- **"From an online tool or website?"** Rejected — there is no "naturalness API" worth
  wiring; the LLM itself is the best phrase generator and it's already in the stack (V4 uses
  it offline-style, zero runtime latency). The OTHER real lever for sounding human is the
  **TTS voice itself** (Piper voice-model choice, or a premium cloud voice) — prosody moves
  perceived humanness more than word choice — but that's a cost/latency/privacy decision,
  **parked** unless the owner asks.

## Explicitly rejected
- Per-ack realtime LLM calls (adds latency to the ack-then-act flow — the whole point of the
  filler is that it's instant).
- External phrase/synonym APIs or scraping phrase websites.
- Unlimited free-form LLM filler with no bank (unauditable, can drift weird; the bank keeps
  the owner in control).
- Removing the honorific style — variety within the persona, not a different persona.

## Phase/commit map

| Phase | Commit prefix | Content |
|---|---|---|
| V1 | `feat(speech-v1)` | voice_lines bank + migration + seeds + anti-repeat picker + replace all fixed lines |
| V2 | `feat(speech-v2)` | prompt variety rules + last-acks context injection |
| V3 | `feat(speech-v3)` | speech_ban / speech_teach actions + Settings list |
| V4 | `feat(speech-v4)` | vocabulary refresh (mine owner style → proposals → approve) |

`npx tsc --noEmit` clean + full `npx vitest run` green after every phase, then STOP and report.
V1 alone kills the "one minute sir" monotony; V2 is nearly free; V3/V4 make it HIS voice.
