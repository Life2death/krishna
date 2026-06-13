# Krishna — Project Structure

> **Krishna** is a voice-activated AI desktop assistant (built on top of the Naukri Lelo app) that opens apps/websites/files, self-learns new targets, executes multi-step task plans, and remembers facts about you.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Framework | Tauri 2 (Rust backend + WebView frontend) |
| Frontend | React 19, TypeScript, Vite |
| UI Components | shadcn/ui (Radix + Tailwind) |
| State | React Context + hooks |
| Storage | SQLite via `@tauri-apps/plugin-sql` (local), `localStorage` (settings) |
| TTS | `window.speechSynthesis` (browser built-in, free, offline) |
| STT | BYOK provider system (Whisper, Groq, Azure Speech, etc.) |
| AI | BYOK curl-based provider system (any LLM) |
| Testing | Vitest + jsdom |

## Top-level Structure

| Path | Purpose |
|------|---------|
| `src/` | Frontend React + TypeScript source |
| `src-tauri/` | Rust backend (Tauri commands, DB migrations, OS integration) |
| `scripts/` | Utility scripts (e.g., icon generation) |
| `docs/` | Design docs for each phase |
| `images/` | App images/banners |
| `.github/` | CI/CD workflows, issue templates |
| `.github/workflows/` | Release pipeline (tags → build + draft release) |

---

## `src/` — Frontend

### `src/types/` — TypeScript interfaces

| File | Defines |
|------|---------|
| `assistant.ts` | `KrishnaSettings`, `Action`, `StepAction`, `ParsedReply`, `AssistantStatus` |
| `plan.ts` | `Step`, `Plan`, `ParsedPlan` — multi-step plan protocol |
| `skill.ts` | `Skill` — learned reusable task recipe |
| `memory.ts` | `Memory` — personal long-term fact |
| `learned-action.ts` | `LearnedAction` — resolvable app target |
| `completion.ts` | `Message` (role+content), `ChatMessage` — LLM conversation types |
| `settings.ts` | App settings shape |
| `settings.hook.ts` | Settings hook return types |
| `provider.type.ts` | AI/STP provider config types |
| `context.type.ts` | App context type |
| `interview-profile.ts` | Interview profile type |
| `job.ts`, `job-history.ts` | Job search types |
| `shortcuts.ts` | Shortcut config types |
| `system-prompts.ts` | System prompt types |
| `completion.hook.ts` | Completion hook return types |
| `index.ts` | Re-exports all types |

### `src/config/` — App configuration

| File | Purpose |
|------|---------|
| `app-aliases.ts` | Static alias map for known apps (e.g., "chrome" → "chrome.exe") |
| `ai-providers.constants.ts` | Built-in AI provider presets |
| `stt.constants.ts` | Built-in STT provider presets |
| `constants.ts` | General constants (markdown formatting, storage keys) |
| `shortcuts.ts` | Default keyboard shortcuts |
| `action-policy.ts` | `classifyAction()` — classifies tools as "safe" or "sensitive" (pure + tested) |
| `index.ts` | Re-exports |

### `src/contexts/` — React Contexts

| File | Purpose |
|------|---------|
| `app.context.tsx` | Main app context (AI providers, settings) |
| `krishna.context.tsx` | **Krishna core** — wake word, processCommand, confirmation flow, skill match, memory injection, conversation history buffer, TTS orchestration |
| `theme.context.tsx` | Theme (dark/light) |
| `expanded-layout.context.tsx` | Layout state |
| `index.ts` | Re-exports |

### `src/hooks/` — React Hooks

| File | Purpose |
|------|---------|
| `useKrishna.ts` | Hook to read Krishna context |
| `useLearnedActions.ts` | CRUD for learned actions (DB-backed) |
| `useMemories.ts` | CRUD for memories (DB-backed) |
| `useAudit.ts` | CRUD for audit log (DB-backed) |
| `useReminders.ts` | CRUD for reminders (DB-backed) |
| `useChatCompletion.ts` | Chat completion logic |
| `useCompletion.ts` | General completion logic |
| `useProfiles.ts` | Interview profiles CRUD |
| `useSystemPrompts.ts` | System prompts CRUD |
| `useSettings.ts` | Settings state |
| `useShortcuts.ts` | Keyboard shortcuts |
| `useGlobalShortcuts.ts` | Global Tauri shortcuts |
| `useCustomProvider.ts` | Custom AI provider setup |
| `useCustomSttProviders.ts` | Custom STT provider setup |
| `useSystemAudio.ts` | System audio capture |
| `useOpenRouterModels.ts` | OpenRouter model list |
| `useHistory.ts` | Navigation history |
| `useCopyToClipboard.ts` | Clipboard utility |
| `useWindow.ts` | Window state |
| `useVersion.ts` | App version |
| `useMenuItems.tsx` | Sidebar menu items |
| `useTitles.ts` | Page titles |
| `index.ts` | Re-exports |

### `src/lib/` — Core logic (non-React)

| File | Purpose |
|------|---------|
| `actions.ts` | `parseActions()` — parses AI response into spoken text + JSON action/plan blocks; `executeAction()` — dispatches single actions |
| `executor.ts` | `executePlan()` — runs multi-step plan sequentially with `${var}` substitution; `resolvePlaceholders()` |
| `memory.ts` | **Pure functions**: `parseRememberCommand()` (regex parser), `buildMemoryPrompt()` (memories → prompt injection) |
| `perception.ts` | `isLookCommand()` — detects "what's on my screen" / "summarize this" intents |
| `reminders.ts` | `parseReminderCommand()` — parses "remind me in N minutes/hours/…" into structured form |
| `resolver.ts` | `resolveApp()` — pipeline: learned DB → static aliases → Rust resolve → optional LLM fallback; `saveAndConfirm()` |
| `parse-yes-no.ts` | `parseYesNo()` — yes/no synonym detection |
| `wake-word.ts` | `detectWakeWord()` — string matching for "hey krishna" |
| `tts.ts` | `getTTS()` — TTS engine wrapper around `window.speechSynthesis` |
| `krishna-mutex.ts` | Module-level mutex flag + Tauri event for barge-in |
| `curl-validator.ts` | Validates curl commands for provider config |
| `utils.ts` | General utilities |
| `platform.ts` | Platform detection |
| `platform-instructions.ts` | Platform-specific instructions |
| `analytics.ts` | User analytics |
| `version.ts` | Version info |
| `chat-constants.ts` | Chat UI constants |
| `response-settings.constants.ts` | Response length/language config |
| `index.ts` | Re-exports |

### `src/lib/database/` — SQLite data access

| File | Tables | Operations |
|------|--------|------------|
| `config.ts` | — | DB connection init via `@tauri-apps/plugin-sql` |
| `memories.action.ts` | `memories` | `getAllMemories`, `getMemoryByKey`, `createMemory` (upsert on key), `deleteMemory`, `deleteAllMemories` |
| `skills.action.ts` | `skills` | `getAllSkills`, `getSkillByName`, `createSkill`, `updateSkillUseCount`, `deleteSkill`, `deleteAllSkills` |
| `learned-actions.action.ts` | `learned_actions` | CRUD for self-learned app targets |
| `audit.action.ts` | `audit_log` | `getAllAuditEntries`, `createAuditEntry`, `getLastReversible`, `deleteAllAuditEntries` |
| `reminders.action.ts` | `reminders` | `getAllReminders`, `getDueReminders`, `createReminder`, `cancelReminder`, `updateReminderDue`, `deleteAllReminders` |
| `system-prompt.action.ts` | `system_prompts` | CRUD for custom prompts |
| `chat-history.action.ts` | `conversations`, `messages` | Chat history persistence |
| `interview-profiles.action.ts` | `interview_profiles` | Interview profile CRUD |
| `index.ts` | — | Re-exports all |

### `src/lib/tools/` — Phase 4 Tool Registry

| File | Tool | Description |
|------|------|-------------|
| `index.ts` | Registry | `getTool()`, `getAllTools()`, `getToolDescriptions()` — manages registered tools |
| `open-target.ts` | `open_target` | Opens URL/app/file via `invoke("open_target")` |
| `youtube-search.ts` | `youtube_search` | YouTube Data API search (BYOK) → deep-link fallback; returns `data.url` |
| `web-search.ts` | `web_search` | Composes Google search URL |

### `src/lib/functions/` — Async service functions

| File | Purpose |
|------|---------|
| `ai-response.function.ts` | `fetchAIResponse()` — streaming AI call via curl-based provider |
| `common.function.ts` | Shared utilities for AI response handling |
| `stt.function.ts` | `fetchSTT()` — speech-to-text via curl-based provider |
| `file-extract.ts` | Text extraction from uploaded files |
| `job-search.function.ts` | Job search API |
| `naukri-lelo.api.ts` | Naukri Lelo backend API |
| `profile-context.ts` | Profile context management |

### `src/lib/storage/` — AsyncStorage wrappers

| File | Purpose |
|------|---------|
| `ai-providers.ts` | AI provider config persistence |
| `stt-providers.ts` | STT provider config persistence |
| `job-providers.ts` | Job search provider config |
| `shortcuts.storage.ts` | Shortcut config |
| `response-settings.storage.ts` | Response settings |
| `profile-context.storage.ts` | Profile context |
| `job-history.ts` | Job history |
| `job-search-skills.ts` | Job search skills |
| `customizable.storage.ts` | Customizable features |
| `helper.ts` | Storage helpers |

### `src/__tests__/` — Test suite (189 tests)

| File | Tests | What it tests |
|------|-------|---------------|
| `phase4-tests.test.ts` | 28 | Plan parsing, executor, tool registry, youtube_search, web_search, open_target, resolver contract, permission gate |
| `common.function.test.ts` | 40 | AI response functions, variable extraction, message building |
| `memory.test.ts` | 9 | `parseRememberCommand`, `buildMemoryPrompt` |
| `perception.test.ts` | 9 | `isLookCommand` (7 patterns), `isUndoCommand` |
| `trust.test.ts` | 11 | `classifyAction`, `isUndoCommand`, undo dispatch |
| `reminders.test.ts` | 12 | `parseReminderCommand` (7 time formats) |
| `resolver.test.ts` | 13 | App resolution pipeline |
| `parse-yes-no.test.ts` | 7 | Yes/no synonym matching |
| `ai-response.function.test.ts` | 12 | AI response streaming |
| `stt.function.test.ts` | 9 | STT function |
| `curl-validator.test.ts` | 10 | Curl command validation |
| `useProfiles.test.ts` | 11 | Interview profile hook |
| `interview-profiles.action.test.ts` | 14 | Interview profile DB actions |
| `storage.test.ts` | 4 | localStorage wrapper |
| `setup.ts` | — | Global Tauri mock setup (Vitest) |

### `src/pages/` — UI Pages

| Directory | Purpose |
|-----------|---------|
| `app/` | Main chat overlay (audio, input, message history, screenshot) |
| `audio/` | Audio settings page |
| `chats/` | Chat history viewer |
| `dashboard/` | Dashboard home |
| `dev/` | Dev Space (AI/STT provider config, job discovery) |
| `jobs/` | Job history |
| `profiles/` | Interview profiles |
| `responses/` | Response settings |
| `screenshot/` | Screenshot settings |
| `settings/` | **Settings** — includes `KrishnaSettings.tsx` (memories list, audit log, reminders list, learned actions, voice/rate controls, LLM fallback toggle) |
| `shortcuts/` | Shortcut config |
| `system-prompts/` | System prompt management |

### `src/components/` — Shared UI Components

| Directory | Contents |
|-----------|----------|
| `ui/` | shadcn/ui primitives: button, card, switch, slider, select, dialog, input, label, tabs, badge, chart, etc. |
| `Header/` | Page header |
| `Markdown/` | Markdown renderer + copy button |
| `Selection/` | Selection overlay |
| `TextInput/` | Text input area |
| `Empty/` | Empty state |
| `Overlay.tsx` | Invisible overlay window |
| `Sidebar.tsx` | App sidebar navigation |
| `DragButton.tsx` | Window drag handle |
| `CustomCursor.tsx` | Stealth cursor |

### Other `src/` files

| File | Purpose |
|------|---------|
| `main.tsx` | App entry point, mounts `KrishnaProvider` + `ThemeProvider` |
| `routes/index.tsx` | Route definitions |
| `layouts/` | DashboardLayout, PageLayout, ErrorLayout |
| `global.css` | Tailwind + global styles |

---

## `src-tauri/` — Rust Backend

### Rust source (`src-tauri/src/`)

| File | Purpose |
|------|---------|
| `main.rs` | Entry point |
| `lib.rs` | Tauri plugin registration, command registration |
| `api.rs` | General API commands |
| `assistant.rs` | Assistant-specific Tauri commands |
| `capture.rs` | `capture_to_base64`, `start_screen_capture` — screen capture |
| `resolver.rs` | **Phase 3**: `resolve_app` (registry → Start Menu → PATH lookup), `verify_target` — Windows app resolution |
| `secure.rs` | Security helpers |
| `shortcuts.rs` | Global shortcut registration |
| `window.rs` | Window management (position, always-on-top, content protection) |

### Database (`src-tauri/src/db/`)

| File | Purpose |
|------|---------|
| `main.rs` | Migration list (v1-v9), registered in order |
| `mod.rs` | Module declaration |
| `migrations/` | SQL migration files |

#### Migrations

| Version | File | Table Created |
|---------|------|---------------|
| v1 | `system-prompts.sql` | `system_prompts` |
| v2 | `chat-history.sql` | `conversations`, `messages` |
| v3 | `interview-profiles.sql` | `interview_profiles` |
| v4 | `interview-profiles-v2.sql` | Adds columns to `interview_profiles` |
| v5 | `interview-profiles-v3.sql` | Adds columns to `interview_profiles` |
| v7 | `learned-actions-v2.sql` | `learned_actions` (Phase 3) |
| v8 | `skills.sql` | `skills` (Phase 4) |
| v9 | `memories.sql` | `memories` (Phase 5) |
| v10 | `audit-log.sql` | `audit_log` (Phase 5.3b — Trust) |
| v11 | `reminders.sql` | `reminders` (Phase 5.3c — Proactivity) |

### Other Rust files

| File | Purpose |
|------|---------|
| `speaker/` | Speaker detection (VAD) — platform-specific (`windows.rs`, `macos.rs`, `linux.rs`) |
| `Cargo.toml` | Dependencies |
| `tauri.conf.json` | Tauri app config (window, plugins, permissions, content protection) |

---

## Key Architecture Patterns

### Krishna Flow (`processCommand` in `krishna.context.tsx`)
1. **Wake word detection** — `detectWakeWord()` on live transcription
2. **Look command** — `isLookCommand()` → screen capture → AI description (skip LLM turn)
3. **Undo command** — `isUndoCommand()` → `getLastReversible()` → reverse action
4. **Reminder intent** — `parseReminderCommand()` → confirm → create reminder
5. **Memory save** — `parseRememberCommand()` for "remember that..." intents
6. **Skill match** — `matchSkillPattern()` against learned skills table (parametrized patterns)
7. **LLM call** — `fetchAIResponse()` with conversation history + memory-injected system prompt
8. **Response parsing** — `parseActions()` extracts spoken text + action/plan JSON blocks
9. **Confirmation** — yes/no (15s timeout, 1 re-ask) for plans + sensitive actions
10. **Execution** — `executePlan()` or single action dispatch
11. **Skill learning** — `derivePattern()` saves parametrized plan template

### Plan Protocol
LLM emits a ````plan` JSON block with typed steps:
```json
{ "say": "I'll search and play it.", "needsConfirmation": true, "plan": [
  { "tool": "youtube_search", "args": { "query": "song" }, "out": "url" },
  { "tool": "open_target", "args": { "target": "${url}" } }
]}
```

### Tool Registry
Tools are registered in `src/lib/tools/index.ts`. Each tool implements the `Tool` interface:
- `name: string`
- `description: string`
- `run(args, ctx) → Promise<ToolResult>`

### Conversation History
Rolling buffer of last 8 `Message` objects (`{role, content}`) stored in `historyRef`, passed to every `fetchAIResponse` call.

### Personal Memory
Memories are stored in SQLite and injected into the system prompt before each LLM call via `buildMemoryPrompt()`. Only confirmed memories are included.

### Migration Discipline
- Every new table = new migration version (never edit existing migrations)
- Migration `.sql` files pinned to LF in `.gitattributes`
- One source of truth: migration columns ↔ TS DTO ↔ INSERT/SELECT must match

---

## Phase History

| Phase | What Was Built | Tags |
|-------|---------------|------|
| 1 | Core voice assistant (TTS, wake word, action parsing, alias map, settings UI) | `voice`, `actions` |
| 2 | 3 blockers (echo loop mutex, toLowerCase corruption, command injection guard) | `fixes` |
| 3 | Self-learning (Rust resolver, learned_actions table, confirmation flow, LLM fallback) | `learning`, `resolver` |
| 4 | Multi-step task agent (plan protocol, tool registry, executor, youtube_search, web_search, skill registry) | `plans`, `tools`, `skills` |
| 5a | Memory & context (conversation history buffer, personal memories table, remember intent, prompt injection) | `memory`, `context` |
| 5.3a | Perception — look-at-screen intent over existing capture | `perception`, `look` |
| 5.3b | Trust — audit log (v10), permission tiers (classifyAction), undo | `trust`, `audit`, `undo` |
| 5.3c | Proactivity — reminders (v11), scheduler, routines | `reminders`, `proactivity` |

---

## Verification

```bash
npm run test          # 189 tests, all pass
npx tsc --noEmit      # Clean (AutoSpeechVad error fixed)
cargo check           # Clean
npm run tauri build   # Release binary
```

## Test Framework

- **Vitest** with jsdom environment
- Global Tauri mocks in `src/__tests__/setup.ts`
- Contract tests verify Rust invoke shapes field-for-field
- In-memory SQLite for DB action tests
