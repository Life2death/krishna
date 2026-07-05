# Settings reorg — grouped submenus (owner-approved 2026-07-05)

> **For the coding agent.** The Settings page is one long flat scroll of 14+ components with
> duplicated functionality. The owner approved the target grouping below — build it faithfully.
> Branch `feat/settings-reorg` off `main`. Prefix `feat(setreorg-pN)`. ONE phase per commit.

## Problems being fixed
1. **Flat clutter** — everything from theme to Gmail keys on one scroll, no grouping.
2. **System-prompt duplication (owner's complaint)** — prompt selection appears in THREE places:
   the `src/pages/system-prompts/` page, `PersonaSelector` (Settings), and
   `SystemPromptSelector` + `SettingsPanel` (app speech panel). One source of truth needed.

## Target structure — sidebar submenu tabs inside Settings

| Tab | Components (existing → moved here) |
|---|---|
| **General** | Theme + transparency, AlwaysOnTopToggle, AppIconToggle, AutostartToggle, AutoScrollToggle, DeleteChats (bottom, "Data" divider) |
| **Persona & Speech** | PersonaSelector (**the single prompt chooser**), link/entry to the system-prompts editor page, CreateSkillDialog, HonorificInput, ResponseLength, LanguageSelector, VoiceModelInput, VoiceMaxTokensInput, and KrishnaSettings' voice-output block (browser voice, speech rate, TTS API key) |
| **Voice & Security** | VoiceIdSettings (enroll + training meter + enable toggle consolidated in ONE place — coordinate with item 7 P3 which touches the same toggle), ComputerControlToggle, wake-word block from KrishnaSettings (Enable Krishna, require wake word, phrase) |
| **Connections** | BrainConnection, Integrations, GmailSettings, MapsSettings |
| **Job Search** | ApplicationProfileSettings (+ future job-autopilot settings) |

## Rules
- **Prompt dedupe:** `PersonaSelector` under Persona & Speech is the ONLY selection UI.
  The `system-prompts` page remains the *editor* (create/edit/generate/delete), reached via a
  "Manage prompts" link from the Persona tab. The `SystemPromptSelector` in the app speech
  panel is REMOVED (or reduced to a read-only "current persona: X" label that links to Settings)
  — owner chose Persona as the single home.
- `KrishnaSettings` is dissolved: wake-word block → Voice & Security; voice-output block →
  Persona & Speech. Delete the component when empty.
- No behavior changes — this is pure reorganization. Every toggle/input keeps its existing
  state wiring, keys, and save semantics. Zero changes to `secureStorage` keys or memory keys.
- Tab state: remember last-open tab (localStorage fine). Deep links used elsewhere (e.g.
  "check Settings" speech pointing at Gmail) must still land correctly — keep element `id`s.
- Responsive: tabs collapse to a dropdown below ~640px width.

## Phases
| Phase | Prefix | Content |
|---|---|---|
| P1 | `feat(setreorg-1)` | Tab scaffold + move components into the 5 groups (no dedupe yet), all existing tests green |
| P2 | `feat(setreorg-2)` | Prompt dedupe (single chooser under Persona; editor link; remove/reduce app-panel selector), dissolve KrishnaSettings |
| P3 | `feat(setreorg-3)` | Polish: last-tab memory, responsive collapse, deep-link ids verified, tests |

Findings file: `SETTINGS_REORG_REVIEW_FINDINGS.md` (reviewer creates at first review).
