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
- `src/pages/app/components/ProfileSelector.tsx` (DEAD — exported, never rendered)
- `src/pages/app/components/completion/ProfileContextBanner.tsx` (**LIVE** — see Phase 3)
- `src/pages/settings/components/ProfileContextLimits.tsx`
- Tests: `src/__tests__/interview-profiles.action.test.ts`, `src/__tests__/useProfiles.test.ts`

### B. Job search / discovery
- `src/lib/functions/job-search.function.ts`
- `src/lib/storage/job-history.ts`, `job-providers.ts`, `job-search-skills.ts`
- `src/types/job.ts`, `src/types/job-history.ts`
- `src/pages/dashboard/components/RecentJobs.tsx`
- `src/pages/dev/components/job-discovery/` — whole dir

### C. Naukri-Lelo API mode + branding
- `src/lib/functions/naukri-lelo.api.ts` (`shouldUseNaukriLeloAPI`) — **LIVE, 5 callers** (Phase 3)
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

### Phase 1 — Unwire UI entry points (routes, menu, pages that mount features)
1. **`src/routes/index.tsx`**: remove `Profiles`, `PrepSession`, `Jobs` from the import,
   and delete the 3 `<Route>` lines (`/profiles`, `/profiles/:id/prep`, `/profiles/:id/jobs`).
2. **`src/pages/index.ts`**: remove the `Profiles`, `PrepSession`, `Jobs` export lines.
3. **`src/hooks/useMenuItems.tsx`**: remove the `{ label: "Interview Profiles", href: "/profiles" }`
   menu entry and the now-unused `UserCircle2Icon` import. (Branding URLs handled in Phase 5.)
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
9. **`src/pages/settings/components/index.ts`**: remove the `ProfileContextLimits` export.

### Phase 3 — LIVE coupling points (edit, don't blind-delete) ⚠️
These three are wired into the running app. Handle each precisely:

10. **`src/hooks/useCompletion.ts`** — removes profile-knowledge injection into the AI prompt:
    - Delete imports `getProfileById`, `buildProfileKnowledgeContext`, `loadProfileRefConvTexts`,
      and `InterviewProfile`.
    - Delete `activeProfileId` from the `useApp()` destructure.
    - Delete `activeProfileRef`, `profileContextRef` refs.
    - The "Builds the effective system prompt …" helper (≈ lines 96-101): replace its body so
      it just returns the base system prompt (no profile prefix).
    - Delete the `useEffect` that reloads the profile on `activeProfileId` change (≈ lines 108-130).
    - Update any callers of the effective-prompt helper to use the plain system prompt.

11. **`src/pages/app/components/completion/Input.tsx`** — remove the profile banner:
    - Delete `import { ProfileContextBanner } from "./ProfileContextBanner"` and the
      `<ProfileContextBanner />` render (≈ line 159).

12. **`src/lib/functions/naukri-lelo.api.ts` callers** — `shouldUseNaukriLeloAPI()` is awaited in
    5 files; each does `const useNaukriLeloAPI = await shouldUseNaukriLeloAPI()` then branches.
    In **each**, delete the import + the call and simplify the branch to always use the
    selected STT/AI provider path (the `false` branch):
    - `src/components/KrishnaVAD.tsx`
    - `src/pages/app/components/completion/AutoSpeechVad.tsx` (deleted in Phase 6 — skip if so)
    - `src/pages/app/components/completion/Audio.tsx` (deleted in Phase 6 — skip if so)
    - `src/pages/chats/components/ChatAudio.tsx`
    - `src/pages/chats/components/AudioRecorder.tsx`
    Then delete `src/lib/functions/naukri-lelo.api.ts`.

### Phase 4 — App context + context type
13. **`src/contexts/app.context.tsx`**: remove
    - `activeProfileId` state + `setActiveProfileId` + the storage-event sync for `ACTIVE_PROFILE_ID`,
    - `naukriLeloApiEnabled` state + `setNaukriLeloApiEnabled` + the `checkImageSupport` /
      `set...` branches that key off `naukriLeloApiEnabled` (simplify image-support logic to the
      custom-provider `{{IMAGE}}` check only),
    - both from the `value` object at the bottom.
14. **`src/types/context.type.ts`**: remove the 4 fields
    `naukriLeloApiEnabled`, `setNaukriLeloApiEnabled`, `activeProfileId`, `setActiveProfileId`.

### Phase 5 — Branding strings (cosmetic, do after compile is green)
15. In `useMenuItems.tsx`, `components/Contribute.tsx`, `components/Promote.tsx`,
    `components/updater/index.tsx`: replace `naukri-lelo` GitHub URLs / "Naukri Lelo" labels /
    support email with Krishna equivalents (repo `github.com/Life2death/krishna`). Pure string edits.

### Phase 6 — Delete now-orphaned files + barrels
Delete files (whole dirs where noted), then remove their barrel exports:
16. Delete: `src/pages/profiles/` (dir), `src/pages/jobs/` (dir),
    `src/pages/dev/components/job-discovery/` (dir),
    `src/pages/dashboard/components/NaukriLeloApiSetup.tsx`, `RecentJobs.tsx`,
    `src/pages/app/components/ProfileSelector.tsx`,
    `src/pages/app/components/completion/ProfileContextBanner.tsx`,
    `src/pages/app/components/completion/Audio.tsx`, `AutoSpeechVad.tsx`,
    `src/pages/settings/components/ProfileContextLimits.tsx`,
    `src/hooks/useProfiles.ts`,
    `src/lib/database/interview-profiles.action.ts`,
    `src/lib/functions/profile-context.ts`, `job-search.function.ts`,
    `src/lib/storage/profile-context.storage.ts`, `job-history.ts`, `job-providers.ts`,
    `job-search-skills.ts`,
    `src/types/interview-profile.ts`, `job.ts`, `job-history.ts`,
    `src/__tests__/interview-profiles.action.test.ts`, `useProfiles.test.ts`.
17. Remove the matching exports from these barrels:
    - `src/lib/database/index.ts` → drop `./interview-profiles.action`
    - `src/lib/functions/index.ts` → drop `./naukri-lelo.api`, `./profile-context`, `./job-search.function`
    - `src/lib/storage/index.ts` → drop `./job-providers`, `./job-history`, `./job-search-skills`, `./profile-context.storage`
    - `src/types/index.ts` → drop `./interview-profile`, `./job`, `./job-history`
    - `src/hooks/index.ts` → drop `useProfiles` (and `useHistory` only if it's job-history; verify)
    - `src/pages/app/components/index.ts` → drop `./ProfileSelector` (and `./speech/StatusIndicator` if removed)
18. **`src/pages/app/components/completion/index.tsx`**: already only renders Input/Screenshot/Files —
    confirm no Audio import remains.

### Phase 7 — Config keys (cosmetic)
19. **`src/config/constants.ts`**: remove unused `STORAGE_KEYS` entries
    (`NAUKRI_LELO_API_ENABLED`, `ACTIVE_PROFILE_ID`, `PROFILE_CONTEXT_SETTINGS`, `JOB_PROVIDER`,
    `JOB_HISTORY`, `JOB_SEARCH_SKILLS`) and the `JOB_MAX_AGE_DAYS` / `JOB_HISTORY_RETENTION_DAYS`
    constants — but ONLY after `npx tsc --noEmit` confirms nothing references them.

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
- Edit LIVE files (Phase 3) before deleting their dependencies, or `tsc` will mislead you about
  what's actually broken.
- Keep `common.function.ts`, `audio-visualizer.tsx`, and the whole `chats`/`audio` pages.
- Commit in phases (one commit per phase) so a regression is easy to bisect.
