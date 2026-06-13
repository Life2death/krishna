# Krishna — Phase 6: Multilingual (Hindi & Marathi) (design + plan)

## Context

Krishna currently assumes English end-to-end: the wake-word matcher is English regex, the
system prompt is English, and the TTS voice picker hunts for an English voice. Vikram needs
Krishna to also **converse in Hindi and Marathi** — understand commands spoken in those
languages and reply out loud in the same language.

This spans **every layer** of the pipeline, so it's its own phase (independent of Phase 5 — can
be built in parallel):

```
LISTEN (STT)  →  WAKE ("Hey Krishna")  →  THINK (LLM)  →  SPEAK (TTS)
  multilingual    Devanagari + roman     reply in lang    voice per language
   model/hint     incl. Marathi form     (keep JSON EN)   (Marathi gap! ↓)
```

**Key reality up front (the one hard constraint):** modern STT (Whisper) and LLMs handle Hindi
and Marathi well, and Windows usually ships **Hindi** TTS voices (hi-IN). But Windows typically
does **not** ship a **Marathi** (mr-IN) `speechSynthesis` voice. So Marathi *output* needs a
fallback decision (see Step 4). Everything else is straightforward.

> **Discipline (carried from Phase 3/4/5 reviews):** wire each change into the *live* flow
> (`krishna.context.tsx`), not just a util — grep for real call-sites (see the "unwired unit"
> lesson). Verify in a real `npm run tauri dev` run speaking actual Hindi/Marathi, not just
> unit tests.

---

## 1. Language strategy — detect + override
- **Setting:** `assistantLanguage` = `auto` (default) | `en` | `hi` | `mr`, in `useSettings` /
  `KrishnaSettings.tsx`.
- **Auto-detect** per utterance: Devanagari script → Indian language; Latin → English. The
  hi-vs-mr ambiguity (shared Devanagari script) is resolved by a **`primaryIndianLanguage`
  setting (Hindi | Marathi)** so TTS voice selection is deterministic; for THINK, the LLM is
  also told to mirror the user's language so it self-corrects on clear Marathi/Hindi cues.
- Carry the resolved language through the turn so THINK and SPEAK agree.

## 2. LISTEN — multilingual STT
- STT is BYOK (`fetchSTT`, `src/lib/functions/stt.function.ts`). Ensure the configured model is
  multilingual (Whisper `whisper-1` / `large-v3` auto-detect hi & mr). Add an optional
  **language hint** param to `fetchSTT` when `assistantLanguage` is not `auto` (improves Marathi
  accuracy, which is weaker than Hindi on most engines).
- Handle both possible transcript forms a provider may return: **Devanagari** (कृष्णा, क्रोम) or
  **romanized** (krishna, chrome). The wake-word and intent layers must tolerate both.

## 3. WAKE — "Hey Krishna" across scripts/pronunciations (biggest code change)
`src/lib/wake-word.ts` currently matches only Latin `krishna/krisna`. Extend `WAKE_WORD_PATTERNS`:
- **Devanagari:** `कृष्ण`, `कृष्णा`, `हे कृष्णा`, `श्री कृष्ण`, `हे कृष्ण`.
- **Marathi romanization:** `krushna`, `krushnaa`, `he krushna` (Marathi pronounces कृष्ण as
  *Krushna*, not *Krishna*).
- **Hindi romanization:** `krishna`, `hey/he krishna`.
- Make `remainder` extraction script-agnostic (strip the matched wake phrase regardless of
  script, return the rest as the command). Add unit tests for each form.

## 4. SPEAK — voice per language (the Marathi gap)
`src/hooks/useSpeech.ts` / `src/lib/tts.ts` currently pick an English voice by name ("David").
Replace with **language-tag selection**: choose a `speechSynthesisVoice` whose `lang` matches the
reply language (`hi-IN`, `mr-IN`, `en-*`).
- **English:** existing behavior.
- **Hindi:** select an `hi-IN` voice (Windows usually has Microsoft Hemant/Kalpana). Works
  out-of-the-box.
- **Marathi (the decision):** `mr-IN` voices are usually absent on Windows. Fallback chain:
  1. Use an installed `mr-IN` voice if present.
  2. **MVP fallback:** fall back to the `hi-IN` voice — Devanagari Hindi phonetics are largely
     intelligible to Marathi speakers (imperfect but free, no deps). **Recommended for now.**
  3. **Later/optional:** a **cloud TTS provider** (Azure/Google/ElevenLabs all have real `mr-IN`)
     via the already-built `TTSProvider` interface + a BYOK key. This is the "premium voice"
     swap we deferred — slot Marathi in here when natural Marathi output matters.
- Speak nothing if no usable voice loads; surface a one-time settings hint
  ("Install a Marathi voice or add a cloud TTS key for native Marathi").

## 5. THINK — reply in the user's language
- Extend `KRISHNA_SYSTEM_PROMPT` (`krishna.context.tsx`): *"Detect the user's language (English,
  Hindi, or Marathi) and reply in that same language. Keep the `action` JSON keys and `target`
  values in ASCII English (e.g. `chrome`, `https://youtube.com`) regardless of spoken language."*
- This means **commands work in any language for free**: "क्रोम खोलो" / "क्रोम उघड" both produce
  `{"action":"open","target":"chrome"}` — the LLM does the NL→intent mapping, so `app-aliases`,
  the resolver, and skills need **no per-language changes**.
- The spoken/`say` text is in the user's language; the action block stays English → `parseActions`
  still strips it and TTS never reads the JSON.

## 6. Settings & UX
- `KrishnaSettings.tsx`: language mode (Auto/English/Hindi/Marathi), primary Indian language
  (Hindi|Marathi) for the hi/mr tie-break, and a per-language voice picker (reuses the
  `getVoices()` list, filtered by `lang`).
- Hinglish/code-mixing ("Krishna, ये file open karo") is common — the LLM handles it; don't try
  to force a single language.

---

## Files
**Modify:** `src/lib/wake-word.ts` (multi-script patterns + tests), `src/lib/tts.ts` +
`src/hooks/useSpeech.ts` (voice-by-`lang` selection + Marathi fallback chain),
`src/lib/functions/stt.function.ts` (optional language hint),
`src/contexts/krishna.context.tsx` (language detect/carry, system-prompt update, pass reply
language to TTS), `src/hooks/useSettings.ts` + `src/types/settings.ts` (language settings),
`src/pages/settings/components/KrishnaSettings.tsx` (UI).
**New:** `src/lib/language.ts` (script/lang detection + resolution helper) + tests.
*(No DB/migration changes — mostly settings, prompt, wake-word, and voice selection.)*

## Verification (real `tauri dev`)
1. **Hindi command:** "हे कृष्णा, क्रोम खोलो" → opens Chrome, Krishna **replies in Hindi aloud**.
2. **Hindi chat:** "हे कृष्णा, तुम कैसे हो?" → spoken Hindi reply.
3. **Marathi command:** "हे कृष्णा, यूट्यूब उघड" → opens YouTube, replies in Marathi (native
   `mr-IN` voice if installed, else Hindi-voice fallback — confirm it speaks intelligibly).
4. **Romanized wake:** "He Krushna, open Notepad" (Marathi pronunciation) → wake-word matches.
5. **English still works** unchanged; switching `assistantLanguage` override is respected.
6. Wake-word unit tests cover Devanagari + Hindi-roman + Marathi-roman forms; `tsc`/`npm test` green.

## One decision to confirm (Marathi output)
Default plan = **Hindi voice fallback for Marathi** (free, no deps, intelligible). If native
Marathi pronunciation is required, we add a **cloud TTS provider (BYOK)** via the existing
`TTSProvider` interface. Confirm which before the SPEAK step is built.

## Deferred
- Other Indian languages (Tamil/Telugu/Bengali…) — same mechanism, add when needed.
- On-device Marathi TTS model — heavy; revisit only if offline Marathi voice becomes a goal.
