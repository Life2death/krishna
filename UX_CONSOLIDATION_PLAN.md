# Plan: Wake Word + Unified Chat Store + Page Consolidation

Agent handoff. Six independent work items — they can be done in any order, but **Item 2 (unify chat store)** should land before **Item 4 (merge chats into dashboard)** because the dashboard will read the unified store.

**Ground rules:**
- `npx tsc --noEmit` must stay clean after each item.
- Any new `.sql` migration file MUST use **LF line endings** (Windows CRLF breaks the Tauri SQL plugin loader). Configure your editor or run `dos2unix` on it.
- Do NOT rename the internal event key `"naukri-lelo-conversation-selected"` ([useHistory.ts:160](src/hooks/useHistory.ts)) or the `selected_naukri_lelo_prompt` localStorage key — they are cross-window sync identifiers, not branding.
- **Avoid the unwired-unit trap:** after wiring the wake word, grep the live path (`KrishnaVAD.tsx → processCommand`) and confirm `detectWakeWord` is actually called at runtime, not just imported.

---

## Item 1 — Wake word (configurable, and actually wired in)

**Why:** The always-on mic currently sends *every* utterance to the LLM — there's no way to "contain" it. A wake word gates when Krishna actually responds.

**Current state:**
- `detectWakeWord(transcript, customWakeWord?)` already exists in [src/lib/wake-word.ts](src/lib/wake-word.ts) with fuzzy patterns ("hey krishna", "krishnaa", "krisna") AND custom-word support. **It is never called.**
- The voice flow is: `KrishnaVAD.onSpeechEnd` → `fetchSTT` → `krishna.processCommand(transcription)` ([KrishnaVAD.tsx:35-62](src/components/KrishnaVAD.tsx)).

**Target:**
1. **Add config state** to [src/contexts/krishna.context.tsx](src/contexts/krishna.context.tsx):
   - `wakeWordEnabled: boolean` (default `true`), `wakeWord: string` (default `"hey krishna"`).
   - Persist to localStorage via new `STORAGE_KEYS.KRISHNA_WAKE_WORD` and `KRISHNA_WAKE_WORD_ENABLED` (add to [src/config/constants.ts](src/config/constants.ts)).
   - Expose them + setters through `KrishnaContextType` (same pattern as `voice`/`rate`).
2. **Wire detection** at the top of `processCommand` (krishna.context.tsx ~line 462), BEFORE the AI provider check:
   ```ts
   // Wake-word gate: when enabled, ignore utterances that don't start with the wake word.
   // A pending confirmation (yes/no) bypasses the gate so follow-ups still work.
   if (wakeWordEnabled && !pendingConfirmationRef.current) {
     const { detected, remainder } = detectWakeWord(transcription, wakeWord);
     if (!detected) {
       setStatus("idle");
       return; // not addressed to Krishna — stay quiet
     }
     transcription = remainder || transcription; // strip "hey krishna" prefix
   }
   ```
   (Make `transcription` reassignable, or use a local `let command = ...`.)
3. **Settings UI** — add a section to [src/pages/settings/components/KrishnaSettings.tsx](src/pages/settings/components/KrishnaSettings.tsx) (near the Enable toggle):
   - A Switch for "Require wake word" bound to `wakeWordEnabled`.
   - A text input for the wake word phrase bound to `wakeWord` (disabled when the switch is off). Helper text: "Say this before a command, e.g. 'Hey Krishna, open VS Code'. Leave the toggle off for always-on (every utterance is processed)."
4. **Overlay affordance (optional but recommended):** show the active wake word in the `KrishnaChat` header or mic tooltip so the user knows the current trigger phrase.

**Verify:** With wake word ON, say a random sentence → nothing happens. Say "Hey Krishna, what time is it" → responds. Toggle OFF → every utterance processed.

---

## Item 2 — Unify the chat store (overlay + dashboard = same data)

**Why:** The overlay "chat" and the dashboard "chats" are two different stores. The user wants ONE conversation log, viewable from either place.

**Current state:**
- **Overlay** `KrishnaChat` reads `krishna.conversationHistory` — an in-memory/`localStorage` `ConversationTurn[]` written in [krishna.context.tsx:951-961](src/contexts/krishna.context.tsx) under key `"krishna_conversation_history"`.
- **Dashboard** reads SQLite via `useHistory()` → `getAllConversations()` ([chat-history.action.ts](src/lib/database/chat-history.action.ts)). Tables `conversations` + `messages` already exist ([chat-history.sql](src-tauri/src/db/migrations/chat-history.sql)) with full CRUD (`createConversation`, `saveConversation`, `deleteConversation`, `deleteAllConversations`).

**Target — make SQLite the single source of truth for voice turns:**
1. **Session model:** one voice session = one `conversations` row. On first voice turn after app launch (or after an idle gap), create a conversation (title = first user utterance via `generateConversationTitle`). Hold the active `conversationId` in a ref in `krishna.context.tsx`.
2. **On each completed turn** (where the code currently builds a `ConversationTurn` and writes localStorage, ~line 951), instead:
   - Append two `messages` rows (role `user` = the command, role `assistant` = `spokenText`) to the active conversation via `saveConversation` (or a new lighter `appendMessages(conversationId, msgs[])` helper in chat-history.action.ts — preferred, avoids rewriting all messages each turn).
   - Keep `conversationHistory` in context as a **derived view of the active conversation's messages** (so `KrishnaChat` keeps working with minimal change), OR refactor `KrishnaChat` to load the active conversation from the DB. Either is fine; the derived-view path is less invasive.
3. **Migration of old data (optional):** one-time import of any existing `krishna_conversation_history` localStorage into a single "Imported voice history" conversation, then clear the key. Guard with a `krishna_voice_history_migrated` flag (mirror the existing `migrateLocalStorageToSQLite` pattern).
4. **Cross-window freshness:** the overlay and dashboard are separate webview windows sharing one SQLite file. After a voice turn writes, emit a Tauri event (or reuse a `CustomEvent`) so an open dashboard refreshes. The dashboard already listens for `conversationDeleted` — add a `conversationUpdated` sibling.

**Do NOT** keep writing to both stores — that reintroduces the split. localStorage write is removed/replaced.

**Verify:** Speak two turns → open Dashboard → the conversation appears with both messages. Open overlay chat → same conversation visible.

---

## Item 3 — Delete conversations (surface it in the UI)

**Why:** No UI to delete a conversation today, though the backend supports it.

**Current state:** `deleteConversation(id)` and `deleteAllConversations()` exist in [chat-history.action.ts](src/lib/database/chat-history.action.ts); `useHistory` already exposes `handleDeleteConfirm`, `confirmDelete`, `cancelDelete`, `deleteConfirm`. The list UI ([pages/chats/index.tsx](src/pages/chats/index.tsx)) just doesn't render delete controls.

**Target:**
- In the conversation list (which becomes the Dashboard in Item 4), add a delete button per card (trash icon, `e.stopPropagation()` so it doesn't navigate) wired to `handleDeleteConfirm(doc.id)`, with a small confirm popover/inline confirm using the existing `deleteConfirm`/`confirmDelete`/`cancelDelete`.
- Add a "Clear all" button (calls `deleteAllConversations` + `refreshConversations`).
- The overlay `KrishnaChat` should also allow clearing the current conversation (small trash icon in its header).

**Verify:** Delete one conversation → it disappears and stays gone after reload. Clear all → empty state shows.

---

## Item 4 — Display errors/warnings in the chat window

**Why:** Errors should surface where the user is already looking (the conversation), not be silent.

**Current state:** `KrishnaChat` overlay already renders `krishna.lastError` as a red banner and a pending/thinking row ([KrishnaChat.tsx:149-175](src/components/KrishnaChat.tsx)). The dashboard conversation view does not.

**Target:**
- Keep the overlay error banner.
- In the merged Dashboard conversation list/detail, surface `krishna.lastError` (and a transient "warning" channel if you add one) at the top of the active conversation, with a dismiss control (reuse `clearLastError`).
- Make sure errors thrown anywhere in `processCommand` set `lastError` (most already do). Add `lastWarning`/`setLastWarning` to context if you want a distinct non-fatal channel (e.g. "Couldn't find that folder, did you mean D:\\Jobs?"). Optional.

**Verify:** Trigger an error (e.g. invalid AI key) → message appears in both overlay and dashboard chat, dismissible.

---

## Item 5 — Merge Chats into Dashboard

**Why:** Dashboard is an empty welcome stub; the conversation list deserves to be the landing page.

**Current state:**
- [pages/dashboard/index.tsx](src/pages/dashboard/index.tsx) — placeholder welcome text.
- [pages/chats/index.tsx](src/pages/chats/index.tsx) — the real conversation list (grouped by date, search).
- Nav: both "Dashboard" (`/dashboard`) and "Chats" (`/chats`) exist in [useMenuItems.tsx](src/hooks/useMenuItems.tsx). Detail route `/chats/view/:conversationId` → `ViewChat`.

**Target:**
- Move the conversation-list UI from `chats/index.tsx` into `dashboard/index.tsx` (or have Dashboard render the chats list component). Add the delete controls from Item 3.
- Remove the separate **"Chats"** nav item from `useMenuItems.tsx`. Keep `/chats/view/:conversationId` route working (it's the detail view) — just update any in-app links/back-buttons that point to `/chats` to point to `/dashboard`.
- Update [routes/index.tsx](src/routes/index.tsx): `/dashboard` renders the list; keep the `view/:id` route. You can drop the `/chats` list route (or redirect it to `/dashboard`).

**Verify:** Dashboard shows the conversation list; "Chats" no longer in sidebar; clicking a conversation still opens the detail view; back returns to Dashboard.

---

## Item 6 — Merge App Settings + Responses into one page

**Why:** Two settings pages for one concern.

**Current state:**
- [pages/settings/index.tsx](src/pages/settings/index.tsx) — Theme, Autostart, AppIcon, AlwaysOnTop, KrishnaSettings.
- [pages/responses/index.tsx](src/pages/responses/index.tsx) — ResponseLength, LanguageSelector, AutoScrollToggle.
- Nav: both "App Settings" (`/settings`) and "Responses" (`/responses`) in [useMenuItems.tsx](src/hooks/useMenuItems.tsx).

**Target:**
- Import the three Responses components (`ResponseLength`, `LanguageSelector`, `AutoScrollToggle` from `pages/responses/components`) into `settings/index.tsx` and render them as a "Response Settings" section (e.g. under a divider/header) below the existing sections.
- Remove the **"Responses"** nav item from `useMenuItems.tsx`.
- Update [routes/index.tsx](src/routes/index.tsx): drop the `/responses` route (or redirect to `/settings`). Keep the `responses/components` files in place — they're now imported by Settings.
- Watch for duplicate save semantics: Settings has a "Save Changes" button for theme/transparency; the Responses components persist on change. Keep them independent — don't force the Responses sections through the Settings save button unless trivial.

**Verify:** Settings page shows Response Length / Language / Auto-scroll sections; "Responses" gone from sidebar; settings still save.

---

## Files touched (summary)

| Item | Files |
|---|---|
| 1 Wake word | `wake-word.ts` (already done), `krishna.context.tsx`, `config/constants.ts`, `KrishnaSettings.tsx` |
| 2 Unify store | `krishna.context.tsx`, `chat-history.action.ts` (add `appendMessages`), `KrishnaChat.tsx` |
| 3 Delete | `pages/dashboard/index.tsx` (merged list), `KrishnaChat.tsx`, reuse `useHistory` |
| 4 Errors in chat | `KrishnaChat.tsx`, merged dashboard list, optional `lastWarning` in `krishna.context.tsx` |
| 5 Merge chats→dashboard | `pages/dashboard/index.tsx`, `routes/index.tsx`, `useMenuItems.tsx` |
| 6 Merge settings+responses | `pages/settings/index.tsx`, `routes/index.tsx`, `useMenuItems.tsx` |

**Do NOT touch:** the speaker/Rust audio capture, `tauri.conf.json`, DB migration files (unless adding a new LF-terminated one for an optional `source` column), or the `naukri-lelo-conversation-selected` / `selected_naukri_lelo_prompt` internal keys.

## Final verification
1. `npx tsc --noEmit` clean.
2. `npm run test` still passes.
3. `npm run tauri dev`: wake word gates voice; speaking creates DB conversations visible in Dashboard and overlay; delete works; errors show in chat; sidebar no longer has "Chats" or "Responses"; Settings has the response options.
