# Window control — move/focus other apps' windows across monitors (design)

> Owner request 2026-07-06 ("Krishna should move File Explorer / Chrome / any app from one
> monitor to another, or bring it to front, when asked"). Reviewer-authored spec; agent codes
> in `krishna-m15`, branch fresh off `main` (suggest `feat/window-control`). Findings ledger:
> new file `WINDOW_CONTROL_REVIEW_FINDINGS.md`. One phase per commit, `tsc --noEmit` +
> `vitest run` + `cargo test` green, STOP per phase.

## What exists already (build on it, don't duplicate)
- `src-tauri/src/automation.rs` — the computer-control module, with the
  `ComputerControlState` enabled-flag gate (`ensure_enabled`) that Rust-side hard-refuses
  when the Settings toggle is off. **All new window commands go through this same gate.**
- `computer_focus_window` at `automation.rs:169` is a stub that returns "not yet implemented
  on this platform" — Phase 2 REPLACES this stub, it does not add a parallel command.
- `enigo` handles synthetic input; it cannot enumerate or move other processes' windows —
  that's why this needs raw Win32, not more enigo.

## Scope decision
**Windows-only v1** (`#[cfg(target_os = "windows")]`), because the owner runs Windows 11 and
the existing stub explicitly deferred the platform-hairy part. Non-Windows keeps the current
"not implemented" error string. No macOS/Linux work.

## Required plumbing (the "what is required" answer)
Win32 APIs via the `windows` crate (add to the existing
`[target.'cfg(target_os = "windows")'.dependencies]` block in `src-tauri/Cargo.toml` —
commit `Cargo.toml` + `Cargo.lock` together, §6 rule):
- **Enumerate windows:** `EnumWindows` + `IsWindowVisible` + `GetWindowTextW` +
  `GetWindowThreadProcessId` → `QueryFullProcessImageNameW` (process exe name).
  Skip untitled/tool windows (`GetWindowLongW(GWL_EXSTYLE)` & `WS_EX_TOOLWINDOW`).
- **Enumerate monitors:** `EnumDisplayMonitors` + `GetMonitorInfoW` (`MONITORINFOF_PRIMARY`,
  work-area rect `rcWork`).
- **Move:** `SetWindowPos` into the target monitor's work area. A **maximized** window must
  be `ShowWindow(SW_RESTORE)`d first, moved, then re-maximized (`SW_MAXIMIZE`) — moving a
  maximized window directly is a classic Win32 no-op/glitch. Preserve relative size where it
  fits; clamp to the target work area.
- **Bring to front:** `SetForegroundWindow` alone is throttled by Windows' foreground-lock
  (a background process may not steal focus). Use the standard escape hatch:
  `ShowWindow(SW_RESTORE)` if minimized → `AttachThreadInput` (or the
  `keybd_event(VK_MENU)` nudge) → `SetForegroundWindow` → detach. Must be reliable when
  Krishna itself is the foreground app — test that path specifically, it's the common case
  (user is talking to Krishna, wants another window raised).

## Design — three phases

### Phase 1 — `window_list` + pure matching logic
- New Rust fn returning all candidate windows: `{ hwnd: isize, title, process_exe }`.
- **Pure, testable matcher** (no Win32 in it): given the candidate list + a spoken query
  ("chrome", "file explorer", "naukri"), rank by: exact title match > title substring >
  process-name match (`explorer.exe`, `chrome.exe` — small built-in alias map:
  "file explorer"→explorer.exe, "chrome"/"browser"→chrome.exe, "edge"→msedge.exe).
  Multiple matches → prefer the most recently active (`GetWindow`/Z-order position from the
  enumeration order, which is top-down). Zero matches → error string listing the 5 top
  window titles so the spoken reply can offer them.
- `cargo test` for the matcher with a fixture list (the §6 "test the real seam" rule: the
  matcher IS the logic; the thin Win32 harvest layer stays untested rather than mocked).

### Phase 2 — Tauri commands (replace the stub)
All gated on `ensure_enabled`:
- `window_focus(query: String)` — match → restore-if-minimized → foreground dance. Replaces
  the `computer_focus_window` stub (keep the command name — it's already registered in
  `lib.rs` and any existing callers keep working).
- `window_move(query: String, monitor: String, maximize: Option<bool>)` — `monitor` accepts
  `"left" | "right" | "primary" | "next" | "1" | "2" | ...`. "next" = cycle. Left/right =
  compare monitor rect x-origins. After moving, also focus it (moving without raising feels
  broken to a voice user).
- `window_list_summary()` — top N window titles, for disambiguation replies and a debug aid.
- Register in `lib.rs`; no new capability/ACL entries needed for plain `#[tauri::command]`s
  (invoke allowlist only — confirm against how the other `computer_*` commands are declared).

### Phase 3 — LLM tool + voice wiring
- One new tool `control_window` with `action: "focus" | "move"`, `target: string`,
  `monitor?: string` — mirrors how existing `computer_*` tools are exposed in
  `src/lib/actions.ts` / the tool schema. `kind: "status"` result, spoken confirmation
  ("Moved Chrome to the right monitor, sir." / the zero-match "I can see X, Y, Z — which
  one?" reply).
- **Not confirm-gated** (non-destructive, easily reversible — unlike `job_apply_submit`),
  but hard-gated on the Computer Control settings toggle like every `computer_*` tool.
- Unit tests: tool-arg → command-arg mapping, disambiguation reply path, disabled-toggle
  error surfaced as a spoken message (drive the real `executeAction` seam with a mocked
  `invoke`, per §6 — not a reimplementation).

## Explicitly rejected
- **enigo/synthetic-input hacks** (Win+Shift+Arrow keystroke injection to move windows):
  tempting one-liner, but it only moves the *focused* window — so it requires focusing
  first, which is the hard part anyway; and it's blind (no feedback on which window moved,
  no monitor targeting beyond "next"). Real enumeration gives honest spoken errors.
- **Cross-platform abstraction crate now:** no macOS/Linux user exists; the stub error
  message already covers them.
- **Tauri window APIs:** they only manage Krishna's own windows, not other processes'.

## Acceptance (owner, live)
1. Two monitors connected. "Krishna, move Chrome to the other monitor" → the Chrome window
   physically moves to the other screen and comes to front, maximized state preserved.
2. "Bring File Explorer to the front" while Krishna is focused → Explorer raises reliably
   (the foreground-lock case), restored if it was minimized.
3. "Move Notepad to the left screen" with Notepad closed → spoken "I don't see Notepad —
   I can see …" with real window titles, no crash.
4. Computer Control toggle OFF → any window command refuses with the existing settings-path
   error message, spoken.
