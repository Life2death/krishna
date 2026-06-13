# Krishna — Phase 3: Self-Learning Actions (design + plan)

## Context

Phases 1–2 gave Krishna a voice (built-in TTS), a wake word ("Hey Krishna"), and a
**static** action map (`src/config/app-aliases.ts`) that opens a fixed list of apps/URLs/files.
The ceiling: anything not in that hand-written list fails ("open Mozilla Firefox" → *"I
couldn't find an app named firefox"*).

Phase 3 removes that ceiling. When Krishna hits an unknown target, it should **resolve it
dynamically, verify it, ask once, remember it**, so the *next* call is instant. The static
alias map becomes a **seed**, not the ceiling — Krishna gets more capable every time it's used.

**Framing (important):** this is NOT model retraining. "Self-learning" = a growing,
inspectable **knowledge store** + a **resolution pipeline** + **human-in-the-loop
confirmation**. The system stays debuggable and the user can view/forget anything it learned.

Two tiers:
- **Tier 1 — learn *targets* (this phase):** unknown app/site/file → resolve, verify, persist.
  Safe to automate (it's data, verified before save).
- **Tier 2 — learn *new skills/verbs* (Phase 4):** declarative skill specs, approval-gated.
  Out of scope here; built in Phase 4.

> Depends on Phase 2 bug-fixes first — see "Prerequisites".

---

## Tier 1 design — the resolution pipeline

When `executeAction` can't resolve a target from `app-aliases.ts`, run a **resolution
pipeline** (deterministic first, LLM last). On success → persist → Krishna confirms by voice.

```
unknown target "mozilla firefox"
  │
  1. Learned store (SQLite)            -- hit? launch instantly. miss? ↓
  2. Windows App Paths registry        -- HKLM/HKCU\...\App Paths\<name>.exe
  3. Start Menu .lnk scan + fuzzy match-- most reliable general method; resolve shortcut target
  4. PATH / Uninstall registry         -- `where`, InstallLocation
  5. LLM fallback                      -- normalize phrase + propose exe/paths → VERIFY exists
  │
  └─ on success → confirm with user → write learned_actions row
```

Rule: **never persist an unverified guess.** A candidate is only saved after the path
exists / the launch succeeds. The LLM only *proposes*; Rust *verifies*.

### Human-in-the-loop ("the training signal")
First time:
> Krishna: *"I didn't have Firefox set up. I found it at
> `C:\Program Files\Mozilla Firefox\firefox.exe` — want me to remember it?"*
> Vikram: *"Yes."* → row saved, confirmed=true.

That spoken yes is the training event. Next "open Firefox" is a step-1 hit. Auto-save without
asking is allowed only for high-confidence registry/Start-Menu hits (configurable).

### Self-healing
Store success/fail outcome per launch. If a learned target later fails (app moved/uninstalled),
invalidate the row and re-run the pipeline, updating the stored path. Knowledge repairs itself.

### Storage (reuses existing `tauri-plugin-sql`)
**Migration framework** (confirmed in code): versioned `Migration` structs in
`src-tauri/src/db/main.rs::migrations()`, registered at `lib.rs:73` via
`.add_migrations("sqlite:krishna.db", db::migrations())`. There are 5 migrations today.
- Add as **version 6** (a *new* migration — existing migrations are immutable; editing one
  changes its sqlx checksum and panics on existing DBs).
- New file: `src-tauri/src/db/migrations/learned-actions.sql`, pulled via
  `include_str!`, append the `Migration { version: 6, … }` entry to the vec.
- ⚠️ **The file MUST be LF-encoded.** `.gitattributes` already pins `*.sql` to `eol=lf`
  because the migration checksum hashes raw bytes — a CRLF file panics at startup on Windows
  (there's a prior commit fixing exactly this). When creating the file on Windows, force LF.

```sql
CREATE TABLE learned_actions (
  id INTEGER PRIMARY KEY,
  phrase TEXT NOT NULL,            -- raw spoken phrase, e.g. "mozilla firefox"
  canonical_name TEXT NOT NULL,    -- normalized, e.g. "firefox"
  action_type TEXT NOT NULL,       -- "open"
  target TEXT NOT NULL,            -- resolved launch target / path / url
  resolved_via TEXT NOT NULL,      -- registry | startmenu | path | llm | manual
  confidence REAL DEFAULT 0.5,
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  confirmed_by_user INTEGER DEFAULT 0,
  last_used_at INTEGER,
  created_at INTEGER
);
CREATE UNIQUE INDEX idx_learned_canonical ON learned_actions(canonical_name, action_type);
```

---

## Implementation steps

### 1. Backend resolution (Rust) — new `src-tauri/src/resolver.rs`
- `#[tauri::command] resolve_app(name: String) -> Option<ResolvedApp>` running steps 2–4:
  - **App Paths registry:** read `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\<name>.exe`
    (and `HKCU`). **Use the `windows-registry` crate (v0.5.3 — already in the dep tree via
    Tauri; tiny: windows-link/result/strings).** Do NOT add `winreg`, and do NOT shell out to
    `reg query` (parsing + injection surface). This is the cleanest, no-new-dep path.
  - **Start Menu scan:** walk `%ProgramData%\Microsoft\Windows\Start Menu\Programs` and
    `%AppData%\Microsoft\Windows\Start Menu\Programs` for `*.lnk`, fuzzy-match name.
    **Launch-first strategy:** the opener plugin / `start "shortcut.lnk"` can launch a `.lnk`
    directly — so for the MVP, store and launch the **`.lnk` path itself** and skip binary
    parsing entirely. Only parse the shortcut's target exe when you need it for display or
    `verify_target`. If parsing is needed, prefer the pure-Rust **`lnk` / `parselnk`** crate
    (no COM, no `windows` feature flags) over `IShellLink` — the `windows` crate is in the
    tree but the `Win32_UI_Shell` feature is NOT enabled, and turning it on pulls a large
    COM surface. Escalate to `IShellLink` only if pure-Rust parsing proves unreliable.
  - **PATH / Uninstall:** `where <name>`; scan Uninstall keys' `InstallLocation`/`DisplayIcon`
    (also via `windows-registry`).
  - Return `{ display_name, exe_path, resolved_via, confidence }` for the best match.
- `#[tauri::command] verify_target(path: String) -> bool` — confirm the file/dir exists
  before any save (also used to verify LLM proposals).
- Register both in `invoke_handler` (`src-tauri/src/lib.rs`).
- Reuse hardened `open_target` (now opener-plugin based + `is_safe_app_name`) for the launch.

### 2. Learned-store data layer (frontend) — new `src/hooks/useLearnedActions.ts`
- CRUD over `learned_actions` via the existing sql plugin (mirror `src/lib/storage/*`).
- `lookup(canonical)`, `save(entry)`, `recordOutcome(id, ok)`, `forget(id)`, `list()`.

### 3. Resolution orchestration (frontend) — new `src/lib/resolver.ts`
- `resolveTarget(rawPhrase): Promise<ResolvedTarget | null>` implementing the full pipeline:
  1. normalize phrase (strip "open", "the", whitespace; lowercase **for matching only**)
  2. `useLearnedActions.lookup` → hit returns immediately
  3. static `resolveAppAlias` (existing seed map)
  4. `invoke("resolve_app")` (registry/Start-Menu/path)
  5. LLM fallback: ask model for canonical name + candidate exe/paths → `invoke("verify_target")`
     on each → first verified wins
- Returns `{ target, displayName, resolvedVia, confidence, needsConfirmation }`.

### 4. Wire into the action flow — modify `src/lib/actions.ts` + `src/hooks/useKrishna.ts`
- In `executeAction`, when alias resolution misses → call `resolveTarget`.
- If `needsConfirmation` (low confidence / not yet confirmed): Krishna **speaks the question**,
  enter a `confirming` state, and capture the next utterance as yes/no (reuse the STT turn).
  - yes → `useLearnedActions.save(confirmed=true)`, then launch.
  - no  → discard, offer "tell me the exact name or path."
- High-confidence registry/Start-Menu hit → save (confirmed=false) + launch, tell the user
  *"Opening Firefox — I'll remember it."*
- After launch, `recordOutcome` for self-healing.

### 5. Visibility & control — extend `src/pages/settings/components/KrishnaSettings.tsx`
- "What Krishna has learned" list: phrase → target, resolved_via, confirmed badge, usage count,
  **Forget** button (`useLearnedActions.forget`). Makes the memory inspectable and editable.
- Toggle: "Ask before remembering new apps" (default on).

### 6. Tests
- Unit: phrase normalization, pipeline ordering/short-circuit, confirmation yes/no parsing.
- Mock `invoke` for `resolve_app` / `verify_target`. Add to `src/__tests__/`.

---

## Resolved design decisions (from investigation)

**Q1 — Confirmation timeout UX.** Event-driven, not a fixed timer. After Krishna asks "remember
it?", enter a `confirming` state and interpret the **next `speech-detected` transcription** as
the answer (reuses the existing VAD/STT turn — no new mechanism). Layer a **safety timeout
(~15s)** that returns to `idle` if no speech arrives. Match a small synonym set
(yes/yeah/sure/ok/do it vs no/nope/cancel/don't); if the answer is neither, re-ask **once**,
then abort. Hardening note: this only works after the **echo-loop fix** (mic paused while
Krishna speaks) — otherwise Krishna hears its own question.

**Q2 — LLM fallback cost.** Make it a **setting, default ON, last-resort only.** Tiers 1–4 are
deterministic (learned-store → registry → Start-Menu → PATH), so the LLM tier fires only when
all of them miss — rare for real installed apps. Crucially, **the resolved result is cached**
to `learned_actions`, so the LLM cost is **one-time per app**, not per invocation. Expose a
toggle "Use AI to resolve unknown apps" so cost-sensitive users can run deterministic-only.

**Q3 — registry access.** Use **`windows-registry` v0.5.3** (already in the dep tree) — not
`winreg` (new dep) and not `reg query` (shell + injection). See Step 1.

**Q4 — migration timing.** **New version-6 migration**, LF-pinned `.sql`. See Storage section.

---

## Prerequisites (fold in before/with Phase 3 — from the Phase 2 review)
> **Status:** all three were fixed by the agent in commits `201ac98` (blockers) and `7b11047`
> (integration gaps) — `open_target` now routes URLs/paths through the **opener plugin** and
> gates app names with `is_safe_app_name`; echo-loop mutex + barge-in landed. Phase 3 inherits
> the hardened base; the items below remain the *principles* to preserve.
1. **Sanitize the launch path / avoid `cmd /C start`** for command-injection safety
   (`assistant.rs`). Resolved targets now come partly from an LLM → must be hardened.
2. **Don't `toLowerCase()` the launched URL/path** in `executeAction` — corrupts URLs.
3. **Pause capture / mute mic while Krishna speaks** (echo-loop) so learned-confirmation
   dialogs don't hear Krishna's own voice. The confirmation flow *depends* on clean capture.

---

## Verification (end-to-end)
1. Fresh DB, ensure Firefox installed but NOT in `app-aliases.ts`.
2. "Hey Krishna, open Mozilla Firefox" → Krishna resolves via Start-Menu/registry, asks to
   remember, you say "yes", Firefox opens.
3. Say it again → opens instantly (step-1 learned-store hit), no question.
4. Settings → "What Krishna has learned" shows the Firefox row; click **Forget**; ask again →
   re-resolves from scratch.
5. Uninstall/rename to break the path, ask again → fail recorded, pipeline re-resolves.
6. `npm run test` green for resolver/normalization/confirmation units.

## Next (Phase 4)
New *verbs* and multi-step tasks ("play this song on YouTube") via a tool-using agent loop +
declarative skill registry. See `PHASE_4_task_agent.md`.
