# Phase 6 — Cleanup Handoff: leftover interview features + branding

## Context
The main interview-prep removal (see `INTERVIEW_REMOVAL_PLAN.md`) is **structurally complete and
verified**: `tsc --noEmit` is clean (except the one known `KrishnaVAD.tsx … minSpeechFrames`
error), all 164 tests pass, and the live coupling points (`useCompletion.ts` profile injection,
`app.context.tsx` image-support logic, the `shouldUseNaukriLeloAPI` callers) were handled correctly.

**However**, a post-removal code review found that two verification claims in the previous summary
were wrong:
- "Grep sweep → zero matches" was **false** — two interview features are still live.
- "Branding → all converted to Krishna" was **false** — ~9 user-facing strings still say
  "Naukri Lelo" / "Focus Assistant".

Root cause: the original plan's branding inventory was incomplete (it listed only 4 files) and
`platform-instructions.ts` was never in the inventory. This file closes those gaps.

**This is a low-risk, mostly cosmetic pass — no structural/DB/context changes.** Validate with
`npx tsc --noEmit` after each section; it must stay clean except the known `minSpeechFrames` error.

---

## Task A — Remove the two remaining interview features (functional)

### A1. `src/lib/platform-instructions.ts`
`PROMPT_TEMPLATES` is a **live, user-selectable** dropdown ("Quick-fill a template" in
`src/pages/app/components/speech/SettingsPanel.tsx`). Two of its eight presets are interview-prep:
- Delete the `{ id: "interview_assistant", name: "Interview Assistant", … }` object (≈ lines 33-52).
- Delete the `{ id: "technical_interview", name: "Technical Interview Helper", … }` object (≈ lines 53-70).
- Leave the other 6 presets (translator, meeting, presentation, learning, customer call, general) intact.
- No other code references those two ids — confirm with grep after deleting.

### A2. `src/pages/app/components/speech/Warning.tsx`
- Line ≈143: the tip "Use Auto-detect for hands-free operation **during interviews**." — reword to a
  generic phrasing, e.g. "for hands-free voice commands." (Remove the interview reference.)

---

## Task B — Finish branding (Naukri Lelo / Focus Assistant → Krishna)

Pure user-facing string edits. **Do NOT change the internal keys in Task C.**

| File | Line(s) | Current | Change to |
|---|---|---|---|
| `src/components/Sidebar.tsx` | 27 | `Focus Assistant` | `Krishna` |
| `src/layouts/ErrorLayout.tsx` | 29 | `<h1>…Focus Assistant</h1>` | `Krishna` |
| `src/pages/dashboard/components/Usage.tsx` | 60, 62 | `Naukri Lelo Usage`, `Naukri Lelo's API` | `Krishna Usage`, `Krishna's API` |
| `src/pages/settings/components/AutostartToggle.tsx` | 21, 30, 31 | `Naukri Lelo` ×3 | `Krishna` |
| `src/pages/app/components/speech/PermissionFlow.tsx` | 108, 168 | `Enable Naukri Lelo` | `Enable Krishna` |
| `src/pages/shortcuts/components/Cursor.tsx` | 26 | `Control Naukri Lelo cursor visibility` | `Control Krishna cursor visibility` |
| `src/pages/audio/index.tsx` | 53 | `Naukri Lelo will automatically fall back…` | `Krishna will automatically fall back…` |
| `src/config/shortcuts.ts` | 27 | `Bring Naukri Lelo forward…` | `Bring Krishna forward…` |
| `src/hooks/useCompletion.ts` | 880 | permission error: `…don't see Naukri Lelo in the list…` | `…don't see Krishna in the list…` |
| `src/hooks/useChatCompletion.ts` | 567 | same permission error string | `…don't see Krishna in the list…` |

Cosmetic comments (optional, do if trivially safe — they're not user-visible):
- `src/contexts/app.context.tsx` lines 139, 152, 154, 170 — "Naukri Lelo is fully free…" comments.
- `src/global.css` line 47 — theme comment.

---

## Task C — DO NOT TOUCH (internal/functional identifiers)

These contain "naukri" but are **internal keys that must match on both sides** — renaming them risks
breaking cross-window sync for zero user benefit. Leave exactly as-is:
- Event key `"naukri-lelo-conversation-selected"` — paired in `src/hooks/useHistory.ts:160` and
  `src/hooks/useCompletion.ts:493`.
- localStorage key `"selected_naukri_lelo_prompt"` — `src/hooks/useSystemPrompts.ts:177-178`.
- Test fixture sample data in `src/__tests__/common.function.test.ts:55-56` (`"Naukri Lelo"` is just
  a test string for `setByPath`, not branding).

> Optional / out of scope: the `hasActiveLicense` "always free" logic in `app.context.tsx` is dead
> weight inherited from naukri-lelo but is not interview-related. Do not remove it in this pass.

---

## Task D — Update documentation if needed

After Tasks A–C, review and update any docs that describe the now-removed features or stale branding:
- `README.md`, `PROJECT_STRUCTURE.md`, `CHANGELOG.md`, and anything in `docs/` — check for mentions
  of Interview Profiles, Jobs, Naukri-Lelo API, "Focus Assistant", or the two deleted prompt presets,
  and update to reflect Krishna's current pure-AI-assistant scope.
- Add a short `CHANGELOG.md` entry summarizing the interview-prep removal + branding cleanup.
- `INTERVIEW_REMOVAL_PLAN.md` and this file (`PHASE_6_CLEANUP.md`) can be left as a historical record,
  or moved into `docs/` — your call, but note their final location in the changelog if you move them.

Only edit docs that actually contain stale references — don't invent new documentation.

---

## Final verification
1. `npx tsc --noEmit` → clean except the known `minSpeechFrames` error.
2. `npm run test` → still 164 passing (no test touches the deleted presets).
3. Grep sweep — these should now return **zero** matches in `src/` (excluding the Task C internal
   keys and the test fixture):
   - `interview` / `Interview`
   - `Focus Assistant`
   - `Naukri Lelo` (user-facing strings — the 4 app.context comments and global.css comment are
     acceptable if you chose to skip the optional cosmetic edits; everything in the Task B table must
     be gone)
4. `npm run tauri dev` → app launches; the "Templates" dropdown no longer lists Interview Assistant /
   Technical Interview Helper; Sidebar/Settings/Dashboard show "Krishna", not "Focus Assistant" /
   "Naukri Lelo".
5. Commit as its own phase (e.g. "Phase 6: remove leftover interview presets + finish Krishna branding").
