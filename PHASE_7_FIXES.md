# Phase 7 — Fixes from UX Consolidation Review

Agent handoff. These are follow-up fixes from a code review of commit `84335a6`
("UX Consolidation"). The previous work landed all 6 items and is ship-able (no data
loss, no crashes), but **Item 2 (unify chat store) only partially delivered** — the overlay
and dashboard are still backed by two different stores. This phase closes that gap plus a
few small cleanups.

**Ground rules:**
- `npx tsc --noEmit` must stay clean after each item.
- `npm run test` must still pass.
- Do NOT rename the internal keys `"naukri-lelo-conversation-selected"` / `selected_naukri_lelo_prompt`.
- After all fixes land, **update the docs** (see "Item 5 — Documentation" below).

---

## Item 1 — Make the overlay and dashboard ONE store (the real unification) — PRIORITY

**Problem:** The agent dual-wrote instead of unifying.
- The overlay (`KrishnaChat`) reads `conversationHistory`, which seeds from `localStorage`
  on mount ([src/contexts/krishna.context.tsx:216-221](src/contexts/krishna.context.tsx)),
  but the localStorage **write was removed** in commit `84335a6`. New voice turns now go to
  in-memory + SQLite only.
- Consequence: within a session both views show new turns, but they are backed by different
  stores and **diverge after an app restart** — the overlay reverts to a stale localStorage
  snapshot while SQLite (the dashboard's source) holds the real history.
- The overlay "Clear conversation" button wipes in-memory + localStorage but **NOT SQLite**
  ([src/components/KrishnaChat.tsx:101-108](src/components/KrishnaChat.tsx)), so the dashboard
  still shows the "cleared" conversation.

**Target — SQLite is the single source of truth for the overlay too:**
1. In `krishna.context.tsx`, stop seeding `conversationHistory` from localStorage. Instead,
   on mount, load the **active (most recent) conversation** from SQLite via
   `getAllConversations()` (or a new `getMostRecentConversation()` helper) and map its
   `messages` into the `ConversationTurn[]` shape the overlay expects. Set
   `activeConversationRef.current` to that conversation's id and `lastTurnTimeRef.current`
   to its `updatedAt` so the idle-threshold session logic continues correctly.
2. Remove the now-orphaned localStorage seed read at lines 216-221 (replace the initializer
   with `[]`, then hydrate from SQLite in a `useEffect`).
3. Keep `conversationHistory` as a **derived view of the active conversation** — when a turn
   is appended (the existing `appendMessages` path ~line 1005), keep updating
   `conversationHistory` in memory for instant overlay feedback, but the canonical store is
   SQLite. On reload it rehydrates from SQLite, so no divergence.
4. **Fix the overlay "Clear conversation"** ([KrishnaChat.tsx:101-108](src/components/KrishnaChat.tsx)):
   route it through `deleteConversation(activeConversationId)` (export a `clearActiveConversation()`
   from the context that deletes the active conversation in SQLite, resets
   `activeConversationRef.current = null`, and clears the in-memory list). Remove the
   `safeLocalStorage.removeItem("krishna_conversation_history")` line.
5. Remove the dead `"krishna_conversation_history"` localStorage key usage entirely (it's no
   longer a store). Optional: one-time migrate any existing value into SQLite then delete the
   key (mirror the `migrateLocalStorageToSQLite` pattern already in chat-history.action.ts).

**Verify:** Speak 2 turns → restart the app → the overlay still shows those 2 turns (loaded
from SQLite) and they match the dashboard exactly. Clear in the overlay → the conversation is
also gone from the dashboard.

---

## Item 2 — Cross-window live refresh (optional but recommended)

**Problem:** The voice flow dispatches `window.dispatchEvent(new CustomEvent("conversationUpdated"))`
([krishna.context.tsx:1021](src/contexts/krishna.context.tsx)), but (a) **nothing listens** for
`conversationUpdated`, and (b) a `CustomEvent` does NOT cross Tauri windows (the overlay and the
dashboard are separate webview windows). So the dashboard never live-updates — it only shows new
voice conversations after a manual navigate/reload. Data is safe in SQLite; it's just not live.

**Target (pick one):**
- **Simplest:** have the dashboard refresh on window focus — in `useHistory` (or the Dashboard
  page), call `refreshConversations()` on a `focus` / `visibilitychange` listener. Cheap, good
  enough.
- **Proper cross-window:** replace the `window.dispatchEvent` with a Tauri event
  (`emit("conversation-updated", id)` from `@tauri-apps/api/event`) and have `useHistory`
  `listen("conversation-updated", () => refreshConversations())`. This actually crosses windows.

Either is acceptable. If you keep the in-window `CustomEvent`, at least add a listener in
`useHistory` so same-window updates work; otherwise remove the dead dispatch.

---

## Item 3 — Revert the incorrect "visual studio" alias

**Problem:** Commit `84335a6` added `"visual studio"` to the VS Code aliases with
`launchCommand: "code"` ([src/config/app-aliases.ts:30](src/config/app-aliases.ts)). Visual Studio
is a **different product** from VS Code; "open visual studio" would now wrongly launch VS Code.

**Target:** Remove `"visual studio"` from the VS Code `aliases` array. (Keep `vscode`,
`visual studio code`, `code`, `vs code`.) If Visual Studio support is ever wanted, add it as its
own separate alias entry with the correct launch target — do not alias it to `code`.

---

## Item 4 — Small cleanups

1. **Delete the dead page files.** `src/pages/chats/index.tsx` and `src/pages/responses/index.tsx`
   are no longer routed (their content was merged into Dashboard and Settings) but are still
   exported from [src/pages/index.ts:2,11](src/pages/index.ts). Delete the two files and remove
   their exports from `pages/index.ts`. Keep `pages/chats/components/` (ViewChat detail view still
   uses `/chats/view/:id`) and `pages/responses/components/` (now imported by Settings).
   Confirm `tsc` stays clean after deletion.
2. **Fix the stray-whitespace typo** `}[  ] = [` → `}[] = [` in
   [src/hooks/useMenuItems.tsx:25](src/hooks/useMenuItems.tsx).
3. **`appendMessages` minor** ([chat-history.action.ts](src/lib/database/chat-history.action.ts)):
   the manual `UPDATE conversations SET updated_at` is redundant — the `messages` table already has
   an `AFTER INSERT` trigger that bumps `updated_at` ([chat-history.sql:30-37](src-tauri/src/db/migrations/chat-history.sql)).
   You may drop the manual UPDATE. Also consider a cleaner message id than
   `String(Date.now()) + String(Math.random())` (e.g. `crypto.randomUUID()`), though the current
   one works.

---

## Item 5 — Documentation (do this LAST, after Items 1-4 land)

After the fixes are complete and verified, update **all** project docs to reflect the current
state. Review each of these and update anything stale:

- `README.md` — update feature list / architecture notes (single SQLite chat store, wake word,
  merged Dashboard + Settings pages, run_shell_command). Remove any mention of separate "Chats"
  or "Responses" pages or a localStorage chat history.
- `PROJECT_STRUCTURE.md` (if present) — update the pages/routes list (no `/chats` list route, no
  `/responses` route; Dashboard is the conversation list).
- `CHANGELOG.md` — add an entry summarizing Phase 7 (overlay/dashboard unified on SQLite, wake
  word, cross-window refresh, alias fix, cleanups).
- Anything in `docs/` referencing the old chat storage, the Chats/Responses nav items, or the
  pre-merge page layout.
- The planning docs `UX_CONSOLIDATION_PLAN.md` and this `PHASE_7_FIXES.md` can be left as a
  historical record or moved into `docs/` — note their final location in the CHANGELOG.

Only edit docs that actually contain stale references — don't invent new documentation.

---

## Files to touch (summary)

| Item | Files |
|---|---|
| 1 Unify store | `src/contexts/krishna.context.tsx`, `src/components/KrishnaChat.tsx`, maybe `src/lib/database/chat-history.action.ts` (add `getMostRecentConversation`) |
| 2 Cross-window refresh | `src/hooks/useHistory.ts` (+ `krishna.context.tsx` if switching to Tauri events) |
| 3 Alias revert | `src/config/app-aliases.ts` |
| 4 Cleanups | `src/pages/chats/index.tsx` (delete), `src/pages/responses/index.tsx` (delete), `src/pages/index.ts`, `src/hooks/useMenuItems.tsx`, `src/lib/database/chat-history.action.ts` |
| 5 Docs | `README.md`, `PROJECT_STRUCTURE.md`, `CHANGELOG.md`, `docs/**` |

## Final verification
1. `npx tsc --noEmit` clean.
2. `npm run test` passes.
3. `npm run tauri dev`: speak turns → restart → overlay history persists and matches the
   dashboard; clear in overlay also clears in dashboard; "open visual studio" no longer launches
   VS Code; sidebar unchanged (no Chats/Responses); docs updated.
