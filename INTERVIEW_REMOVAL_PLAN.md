# Plan: Remove all interview-related functionality from Krishna

## Goal
Krishna was forked from **naukri-lelo** (an interview-prep assistant). It is now a
pure voice AI desktop assistant. This plan strips out every interview-prep feature:
**Interview Profiles**, **Job search/discovery**, **profile-knowledge injection into
the AI prompt**, and the **Naukri-Lelo API mode toggle + branding**.

The work is mechanical but has **three live coupling points** that must be edited
carefully (not just deleted), or the app won't compile / the AI flow breaks. Those are
called out explicitly in Phase 3.

**Validation after every phase:** `cd D:\Learning\krishna && npx tsc --noEmit`
(there is ONE pre-existing unrelated error: `KrishnaVAD.tsx … minSpeechFrames` — ignore
only that one; any other error is something this plan introduced and must be fixed before
moving on).

---

## Inventory (what we're removing, grouped)

### A. Interview Profiles feature
- `src/pages/profiles/` (index.tsx, PrepSession.tsx, ProfileFormDialog.tsx) — whole dir
- `src/pages/jobs/` (index.tsx, JobHistorySection.tsx) — whole dir
- `src/hooks/useProfiles.ts`
- `src/lib/database/interview-profiles.action.ts`
- `src/lib/functions/profile-context.ts`
- `src/lib/storage/profile-context.storage.ts`
- `src/types/interview-profile.ts`
- `src/pages/app/components/ProfileSelector.tsx` (DEAD — exported in barrel, never rendered; consumes `activeProfileId`)
- `src/pages/app/components/completion/ProfileContextBanner.tsx` (**LIVE** in Input.tsx — unwire in Phase 3, delete in Phase 4)
- `src/pages/settings/components/ProfileContextLimits.tsx`
- Tests: `src/__tests__/interview-profiles.action.test.ts`, `src/__tests__/useProfiles.test.ts`

### B. Job search / discovery
- `src/lib/functions/job-search.function.ts`
- `src/lib/storage/job-history.ts`, `job-providers.ts`, `job-search-skills.ts`
- `src/types/job.ts`, `src/types/job-history.ts`
- `src/pages/dashboard/components/RecentJobs.tsx`
- `src/pages/dev/components/job-discovery/` — whole dir

### C. Naukri-Lelo API mode + branding
- `src/lib/functions/naukri-lelo.api.ts` (`shouldUseNaukriLeloAPI`) — **LIVE, 3 callers** (Phase 3)
- `src/pages/dashboard/components/NaukriLeloApiSetup.tsx`
- `naukriLeloApiEnabled` state in `src/contexts/app.context.tsx` + `src/types/context.type.ts`
- Branding strings (naukri-lelo URLs/labels) in `useMenuItems.tsx`, `Contribute.tsx`,
  `Promote.tsx`, `components/updater/index.tsx`

### D. Dead speech-mode leftovers (optional, from the old interview/AI mode switch)
- `src/pages/app/components/completion/Audio.tsx` + `AutoSpeechVad.tsx` (DEAD — not rendered)
- `src/pages/app/components/speech/StatusIndicator.tsx`, `ModeSwitcher.tsx` (verify dead first)
- KEEP `speech/audio-visualizer.tsx` — used by `pages/chats/components/AudioRecorder.tsx`

### NOT removed (leave as-is)
- `src/lib/functions/common.function.ts` — core curl/message processing, NOT interview code
- `src/pages/chats/`, `src/pages/audio/` — general features (but Phase 3 touches their STT calls)
- DB migrations `interview-profiles*.sql` (migrations 3,4,5) — **do not delete migration files
  or renumber**; existing installs already ran them. The `interview_profiles` table simply
  goes unused. (Optional: add a later `DROP TABLE` migration — out of scope here.)

---

## Execution order (safe: leaves → roots)

Work top-down so barrel exports and importers are fixed before the files they point to vanish.

> **Why this order (verified against the code):** Three files — `ProfileContextBanner.tsx`,
> `ProfileSelector.tsx`, `RecentJobs.tsx` — all consume `activeProfileId`. They become *unwired*
> from the live app by end of Phase 3, but the files still sit on disk. If we stripped the context
> state (old Phase 4) before deleting these files (old Phase 6), `npx tsc --noEmit` would go RED in
> all three and stay red until deletion — violating the "tsc clean after every phase" rule. So we
> **delete orphaned files BEFORE stripping context**. The old Phase 4↔6 are swapped below.

### Phase 1 — Unwire UI entry points (routes, menu, pages that mount features)
1. **`src/routes/index.tsx`**: remove `Profiles`, `PrepSession`, `Jobs` from the import,
   and delete the 3 `<Route>` lines (`/profiles`, `/profiles/:id/prep`, `/profiles/:id/jobs`).
2. **`src/pages/index.ts`**: remove the `Profiles`, `PrepSession`, `Jobs` export lines.
3. **`src/hooks/useMenuItems.tsx`**: remove the `{ label: "Interview Profiles", href: "/profiles" }`
   menu entry and the now-unused `UserCircle2Icon` import. (Branding URLs handled in Phase 6.)
4. **`src/pages/dashboard/index.tsx`**: remove `<NaukriLeloApiSetup />` and `<RecentJobs />`
   and their import. Replace body with a minimal placeholder (e.g. a short "Krishna" heading)
   so the Dashboard route still renders.
5. **`src/pages/dev/index.tsx`**: remove `<JobDiscoveryConfig />` and its import from the
   destructured `./components`.
6. **`src/pages/dev/components/index.ts`**: remove `export * from "./job-discovery"`.
7. **`src/pages/dashboard/components/index.ts`**: remove `NaukriLeloApiSetup` and `RecentJobs` exports.

### Phase 2 — Settings page
8. **`src/pages/settings/index.tsx`**: remove `ProfileContextLimits` import + its `<ProfileContextLimits>`
   render, and the `pendingProfileContext` / `savedProfileContext` state, the
   `getProfileContextSettings`/`setProfileContextSettings` import and their use in `handleSave`
   and `hasChanges`. (Keep Theme, Autostart, AppIcon, AlwaysOnTop, KrishnaSettings.)
9. **`src/pages/settings/components/index.ts`**: remove the `export * from "./ProfileContextLimits"`
   line (confirmed at line 5). ⚠️ Required — without it, tsc errors on a missing module once the
   file is deleted in Phase 4.

### Phase 3 — LIVE coupling points (edit, don't blind-delete) ⚠️
These are wired into the running app. Handle each precisely:

10. **`src/hooks/useCompletion.ts`** — removes profile-knowledge injection into the AI prompt:
    - Delete imports `getProfileById`, `buildProfileKnowledgeContext`, `loadProfileRefConvTexts`
      (≈ line 16), and `InterviewProfile` (≈ line 20).
    - Delete `activeProfileId` from the `useApp()` destructure (≈ line 65).
    - Delete `activeProfileRef` (≈ line 70) and any `profileContextRef` refs.
    - `buildEffectiveSystemPrompt` helper (≈ line 97): replace its body so it just returns the base
      `systemPrompt` (no profile prefix).
    - Delete the `useEffect` that reloads the profile on `activeProfileId` change (≈ lines 108-130).
    - ⚠️ **`buildEffectiveSystemPrompt` is used at TWO call sites** (≈ lines 255 and 658) with it
      listed in TWO `useCallback` dependency arrays (≈ lines 333 and 748). After simplifying the
      helper you can keep the call sites as-is, but **remove `buildEffectiveSystemPrompt` from both
      dep arrays** if you inline it, or leave both consistent. Don't fix only one.

11. **`src/pages/app/components/completion/Input.tsx`** — remove the profile banner:
    - Delete `import { ProfileContextBanner } from "./ProfileContextBanner"` and the
      `<ProfileContextBanner />` render (≈ line 159).

12. **`src/lib/functions/naukri-lelo.api.ts` callers** — `shouldUseNaukriLeloAPI()` is awaited in
    **exactly 3 files** (verified by grep — NOT 5). Each does
    `const useNaukriLeloAPI = await shouldUseNaukriLeloAPI()` then branches. In **each**, delete the
    import + the call and simplify to always use the selected STT/AI provider path (the `false` branch):
    - `src/components/KrishnaVAD.tsx` (direct import from `@/lib/functions/naukri-lelo.api`)
    - `src/pages/app/components/completion/AutoSpeechVad.tsx` (deleted in Phase 4 — skip if already gone)
    - `src/pages/chats/components/AudioRecorder.tsx` (imports via the `@/lib` barrel)

    > NOTE: `Audio.tsx` and `ChatAudio.tsx` do **not** call `shouldUseNaukriLeloAPI()`; they read
    > `naukriLeloApiEnabled` from `useApp()` directly. `Audio.tsx` is dead (deleted in Phase 4);
    > `ChatAudio.tsx`'s direct usage is resolved by the context change in Phase 5.

    Then delete `src/lib/functions/naukri-lelo.api.ts` (in Phase 4 with the other orphans).

### Phase 4 — Delete now-orphaned files + barrels  *(was Phase 6 — moved up)*
Everything below is fully unwired by end of Phase 3, so deleting now keeps tsc green when Phase 5
strips the context state. Delete files (whole dirs where noted), then remove their barrel exports.

13. Delete: `src/pages/profiles/` (dir), `src/pages/jobs/` (dir),
    `src/pages/dev/components/job-discovery/` (dir),
    `src/pages/dashboard/components/NaukriLeloApiSetup.tsx`, `RecentJobs.tsx`,
    `src/pages/app/components/ProfileSelector.tsx`,
    `src/pages/app/components/completion/ProfileContextBanner.tsx`,
    `src/pages/app/components/completion/Audio.tsx`, `AutoSpeechVad.tsx`,
    `src/pages/settings/components/ProfileContextLimits.tsx`,
    `src/hooks/useProfiles.ts`,
    `src/lib/database/interview-profiles.action.ts`,
    `src/lib/functions/naukri-lelo.api.ts`,
    `src/lib/functions/profile-context.ts`, `job-search.function.ts`,
    `src/lib/storage/profile-context.storage.ts`, `job-history.ts`, `job-providers.ts`,
    `job-search-skills.ts`,
    `src/types/interview-profile.ts`, `job.ts`, `job-history.ts`,
    `src/__tests__/interview-profiles.action.test.ts`, `useProfiles.test.ts`.
14. Remove the matching exports from these barrels:
    - `src/lib/database/index.ts` → drop `./interview-profiles.action` (confirmed at line 4)
    - `src/lib/functions/index.ts` → drop `./naukri-lelo.api`, `./profile-context`, `./job-search.function`
    - `src/lib/storage/index.ts` → drop `./job-providers`, `./job-history`, `./job-search-skills`, `./profile-context.storage`
    - `src/types/index.ts` → drop `./interview-profile`, `./job`, `./job-history`
    - `src/hooks/index.ts` → drop `./useProfiles` (line 17). **KEEP `./useHistory`** (line 11) —
      verified it's the chat/conversation-history navigation hook, NOT job-history.
    - `src/pages/app/components/index.ts` → drop `./ProfileSelector` (line 5) and
      `./speech/StatusIndicator` (line 4, if you delete that file). **KEEP `./speech/audio-visualizer`** (line 3).
15. **`src/pages/app/components/completion/index.tsx`**: confirmed it already only renders
    Input/Screenshot/Files — no Audio import to remove.

### Phase 5 — App context + context type  *(was Phase 4 — moved down)*
16. **`src/contexts/app.context.tsx`**: remove
    - `activeProfileId` state + `setActiveProfileId` + the storage-event sync for `ACTIVE_PROFILE_ID`
      (≈ lines 502-504),
    - `naukriLeloApiEnabled` state + `setNaukriLeloApiEnabled`. ⚠️ This identifier appears at **THREE
      spots** (verified): the initial `useState` read (≈ line 168), the `loadData()` read
      (≈ lines 346-348), and the setter that writes the storage key (≈ line 715). Remove all three.
    - **`checkImageSupport` effect (≈ lines 525-560):** collapse the `if (naukriLeloApiEnabled) { … }
      else { … }` down to **just the `else` body** (the custom-provider `{{IMAGE}}` curl check), and
      drop `naukriLeloApiEnabled` from the effect's dependency array (≈ line 560).
    - **`onSetSelectedAIProvider` (≈ lines 615-624):** remove the `if (!naukriLeloApiEnabled) { … }`
      guard — keep its body running unconditionally (always do the `{{IMAGE}}` curl check).
    - Remove both `naukriLeloApiEnabled`/`setNaukriLeloApiEnabled` and `activeProfileId`/`setActiveProfileId`
      from the `value` object at the bottom.
17. **`src/types/context.type.ts`**: remove the 4 fields
    `naukriLeloApiEnabled`, `setNaukriLeloApiEnabled`, `activeProfileId`, `setActiveProfileId`.

### Phase 6 — Branding strings (cosmetic, do after compile is green)
18. In `useMenuItems.tsx`, `components/Contribute.tsx`, `components/Promote.tsx`,
    `components/updater/index.tsx`: replace `naukri-lelo` GitHub URLs / "Naukri Lelo" labels /
    support email with Krishna equivalents (repo `github.com/Life2death/krishna`). Pure string edits.

### Phase 7 — Config keys (cosmetic, MUST be last)
19. **`src/config/constants.ts`**: remove unused `STORAGE_KEYS` entries
    (`NAUKRI_LELO_API_ENABLED`, `ACTIVE_PROFILE_ID`, `PROFILE_CONTEXT_SETTINGS`, `JOB_PROVIDER`,
    `JOB_HISTORY`, `JOB_SEARCH_SKILLS`) and the `JOB_MAX_AGE_DAYS` / `JOB_HISTORY_RETENTION_DAYS`
    constants — but ONLY after `npx tsc --noEmit` confirms nothing references them. (This is last
    because `NAUKRI_LELO_API_ENABLED` is read in 3 places in app.context until Phase 5 clears them.)

---

## Final verification
1. `npx tsc --noEmit` → clean except the one known `minSpeechFrames` error.
2. `npm run test` (Vitest) → green (the two deleted test files are gone; nothing else should break).
3. `npm run tauri dev` → app launches; Dashboard, Settings, Dev Space, Chats, Audio all render;
   no "Interview Profiles" in the menu; mic → STT → LLM → TTS still works end-to-end.
4. Grep sweep for stragglers (should return nothing in `src/`):
   `interview | Interview | naukriLelo | NaukriLelo | activeProfileId | ProfileContext | job-search | RecentJobs`.

## Notes for the executing agent
- Do NOT touch `src-tauri/src/db/migrations/*.sql` or `db/main.rs` — removing/renumbering
  migrations corrupts existing installs. The interview tables just go dormant.
- **Phase order matters:** unwire (1-3) → DELETE orphans (4) → strip context (5) → branding (6)
  → config keys (7). Deleting the `activeProfileId`-consuming files (`ProfileContextBanner`,
  `ProfileSelector`, `RecentJobs`) BEFORE removing the context state is what keeps `tsc` green at
  every checkpoint. Do not revert to deleting files last.
- Keep `common.function.ts`, `audio-visualizer.tsx`, `useHistory`, and the whole `chats`/`audio` pages.
- Run `npx tsc --noEmit` after each phase — it must be clean except the one known
  `KrishnaVAD.tsx … minSpeechFrames` error. Any other error came from the current phase.
- Commit in phases (one commit per phase) so a regression is easy to bisect.
