# Plan — Computer Control (keyboard + mouse injection) for Krishna

> **For the implementing agent.** This adds the ability for Krishna to type text, press
> key-combos, and click/move the mouse on the user's machine — so "type `opencode` in the
> command prompt and press Enter" actually works. This is the **single highest-risk capability**
> in the product. Read the **Safety Model** section before writing any code, and implement the
> feature-flag + confirmation gates in the *same* PR as the injection commands — never land the
> injection without the guards.

---

## 0. Why this is needed (root cause)

When the user said "type opencode in command prompt", Krishna stayed silent. **This is not a bug.**
The system prompt in `src/contexts/krishna.context.tsx` explicitly forbids it:

- `SYSTEM_PROMPT_RULES` rule 6 (line ~136): *"NEVER do a 2-step 'open terminal then type into it'
  plan — there is no tool to type into a terminal after it opens."*
- rule 9 (line ~139): *"'open command prompt' → open_target with target 'cmd'. Krishna cannot type
  into it afterwards."*

There is genuinely no tool that injects keystrokes. The AI followed its instructions and produced
no action. This plan removes that limitation by adding real input-injection tools, then rewrites
those rules.

---

## 1. Architecture decision — native client tool, NOT a brain MCP server

Krishna has two tool surfaces (confirmed by reading the code):

| Surface | Where it runs | Mechanism |
|---|---|---|
| **Native tools** (`packages/core/tools/*.ts`) | **on the user's machine** | `invoke()` → Rust `#[tauri::command]` |
| **MCP tools** (brain hub) | **on the brain server** | `POST /mcp/execute` → `McpHub.callTool` |

Keyboard/mouse injection **must happen on the user's physical machine** (that's where the screen and
the command prompt are). The brain is a remote Node/Fastify server — it cannot move the user's mouse.
So computer control **must be a native client-side Tauri tool**, using a Rust input-injection crate.
Do **not** build it as a brain MCP server.

This mirrors the existing `open_target` tool exactly: `packages/core/tools/open-target.ts` →
`invoke("open_target", …)` → `open_target` Rust command. We follow the same pattern.

---

## 2. Scope — two phases. This plan delivers Phase 1 only.

### Phase 1 (THIS PLAN) — "blind" input into the focused window
The AI emits explicit input steps; they hit whatever window currently has OS focus. Covers the
literal ask: open cmd → focus it → type a command → press Enter. No screen reading; the AI is
"typing with its eyes closed", relying on the user/sequence to have the right window focused.

New tools: `computer_type`, `computer_key`, `computer_click`, `computer_move`, `computer_focus_window`.

### Phase 2 (FOLLOW-UP — note only, do NOT build now) — screen-aware agentic loop
Screenshot → vision model → coordinate-based clicks → screenshot → repeat. The app already has the
pieces: `src-tauri/src/capture.rs` (screenshot) and a vision path in `krishna.context.tsx`
(`visionPrompt`, ~line 1209). This is a much larger, riskier feature (prompt-injection surface
explodes once the model acts on screen contents). Capture it in a separate `COMPUTER_USE_VISION_PLAN.md`
later. **Out of scope here.**

---

## 3. Safety Model (implement this FIRST, in the same PR)

Computer control can do anything the user can — wipe files, send money, change settings. The guards
are not optional polish; they are the feature's load-bearing structure.

### 3.1 Feature flag — OFF by default
- Add `computerControlEnabled: boolean` (default **false**) to the customizable settings
  (`src/lib/storage.ts` `CustomizableState` / `DEFAULT_CUSTOMIZABLE_STATE`).
- Surface a toggle in Settings with an explicit warning ("Lets Krishna control your keyboard and
  mouse. Only enable if you understand the risk.").
- The Rust commands must **hard-refuse** if the flag is off — pass the flag through, or read it from
  a Rust-side `AppState`/secure store synced on toggle. Defense in depth: never rely on the JS layer
  alone to gate a privileged Rust command. (Match how `set_license_status` syncs JS→Rust state today.)

### 3.2 Every computer tool is SENSITIVE → confirmation required
- Add the `computer_*` tools to `packages/core/action-policy.ts` so they always classify `sensitive`.
  The existing `DESTRUCTIVE_VERBS` already contains `type`? No — it does not. Add an explicit rule:
  any tool whose name starts with `computer_` → `sensitive`, full stop (put this check **before** the
  safe-verb fallthrough). `computer_move`/`computer_focus_window` may feel harmless but keep them
  sensitive in v1 for a uniform mental model.
- **The executor currently hard-rejects sensitive native tools** (`packages/core/executor.ts:50-62`)
  with no confirmation path — only `mcp_`-prefixed tools are exempted. Extend that exemption:
  add `computer_` to the prefix skip-list so the tool's own `run()` can perform the confirmation
  round-trip (exactly like the MCP bridge does). Then each `computer_*` tool calls
  `getConfirmAction()` (from `packages/core/tools/mcp-bridge.ts` — re-export it or move the
  `setConfirmAction/getConfirmAction` pair to a shared module) before invoking Rust.
- The voice yes/no confirmation flow already exists (`pendingConfirmationRef` in
  `krishna.context.tsx`, 15s timeout → auto-decline). Reuse it; add a `computer_action` case to the
  pending-confirmation union if needed.
- Confirmation prompt must **state the literal action**: "Type `opencode` and press Enter into the
  focused window — confirm?" Never a generic "run this action?".

### 3.3 Session consent, not blanket consent
- A confirmed action authorizes **that one step**, not a standing grant. A multi-step plan
  (`type` → `key`) should confirm once for the whole plan with the steps spelled out, but a *new*
  plan re-confirms. Do not cache "yes" across turns.

### 3.4 Kill switch
- Global `Esc` (or a dedicated shortcut) aborts any in-flight computer-control sequence via the
  existing `AbortSignal` plumbed through `executePlan(steps, { signal })`. Wire a hard interrupt so a
  runaway loop can always be stopped by the human.

### 3.5 Audit everything
- Every `computer_*` execution writes an audit entry (reuse `createAuditEntry` from `@krishna/core`,
  as `mcp-tools.ts` does). Redact the typed text through `redactText` before storing — typed strings
  may contain secrets/passwords.

### 3.6 Hard "never" list (enforce or document)
- **Never type into password fields** when a screen-aware phase lands — and even in Phase 1, the
  confirmation copy should warn the user not to confirm typing into a password prompt. (We cannot
  reliably detect a focused password field in Phase 1; this is a documented residual risk.)
- Screen contents read in Phase 2 are **data, not instructions** — prompt-injection defense. Note now,
  enforce when Phase 2 is built.

---

## 4. Implementation — file by file

### 4.1 Rust — new crate dependency
`src-tauri/Cargo.toml`, `[dependencies]`:
```toml
enigo = "0.2"
```
`enigo` is cross-platform keyboard/mouse simulation (Windows/macOS/X11). Platform caveats to note in
code comments:
- **Windows**: works out of the box (the user's primary platform).
- **macOS**: requires the app to be granted **Accessibility** permission (System Settings → Privacy).
  There's already `tauri-plugin-macos-permissions` in Cargo — use it to check/prompt.
- **Linux Wayland**: `enigo` input injection is limited/unsupported; X11 works. Gate or warn.

### 4.2 Rust — new command module `src-tauri/src/automation.rs`
Implement, behind a `computer_control_enabled` state check, the commands below. Keep each tiny and
return `Result<String, String>`:

```rust
// Pseudocode — agent fills in real enigo 0.2 API.
#[tauri::command]
pub fn computer_type(state: …, text: String) -> Result<String, String> {
    ensure_enabled(state)?;                       // hard refuse if flag off
    let mut enigo = Enigo::new(&Settings::default()).map_err(…)?;
    enigo.text(&text).map_err(…)?;
    Ok(format!("typed {} chars", text.len()))
}

#[tauri::command]
pub fn computer_key(state: …, keys: String) -> Result<String, String> {
    // keys like "enter", "ctrl+c", "cmd+shift+t" — parse into modifiers + key
    // press modifiers down, click main key, release modifiers
}

#[tauri::command]
pub fn computer_click(state: …, button: Option<String>) -> Result<String, String> {
    // left/right/middle click at current cursor position
}

#[tauri::command]
pub fn computer_move(state: …, x: i32, y: i32) -> Result<String, String> {
    // absolute move; clamp to screen bounds
}

#[tauri::command]
pub fn computer_focus_window(state: …, title_substring: String) -> Result<String, String> {
    // best-effort: raise/focus a window whose title contains the substring.
    // Windows: use windows-registry/win32 or a small helper; may be deferred —
    // if too involved, ship without focus_window and rely on the user focusing
    // the target window before confirming. Document the limitation.
}
```
Add a shared `ensure_enabled()` helper that reads the synced flag and errors with a clear message if
disabled.

Register all commands in `src-tauri/src/lib.rs` `invoke_handler![…]`. Add the `computer_control_enabled`
flag to whatever `AppState` holds runtime config (mirror `set_license_status`), plus a
`set_computer_control_enabled` command the Settings toggle calls.

### 4.3 Tauri capabilities
`src-tauri/capabilities/cross-platform.json` — the new commands are custom `#[tauri::command]`s, so
they're covered by the app's command invocation (no new permission string needed unless you split a
capability). Confirm the `main` window can invoke them; the `presence` window must **not** (its
minimal `presence.json` capability already excludes everything — leave it).

### 4.4 Core — new tool file `packages/core/tools/computer.ts`
One `Tool` per command, following `open-target.ts` exactly, **plus the confirmation round-trip**:

```ts
import { invoke } from "@tauri-apps/api/core";
import type { Tool } from "./index";
import { getConfirmAction } from "./mcp-bridge"; // or shared module

async function confirmOrAbort(humanDescription: string): Promise<boolean> {
  const fn = getConfirmAction();
  if (!fn) return false;            // no confirmer wired → refuse (fail safe)
  return fn(humanDescription);
}

export const computerTypeTool: Tool = {
  name: "computer_type",
  description: "Type literal text into the currently focused window/field. Sensitive — always confirmed.",
  run: async (args) => {
    const text = args.text;
    if (!text) return { success: false, error: "Missing arg: text" };
    if (!(await confirmOrAbort(`Type "${text}" into the focused window`)))
      return { success: false, error: "User declined" };
    try {
      const out = await invoke<string>("computer_type", { text });
      return { success: true, output: out };
    } catch (e) { return { success: false, error: String(e) }; }
  },
};
// …computer_key, computer_click, computer_move, computer_focus_window similarly.
```
Register them in `packages/core/tools/index.ts` (`register(computerTypeTool)` …) — but **only when the
feature flag is on**. Cleanest: register unconditionally (so the AI can see them) and let the Rust
`ensure_enabled` + JS confirmation be the gate; OR gate registration on the flag so a disabled user's
AI never even sees the tools. **Prefer gating registration on the flag** — if the capability is off,
the AI shouldn't propose it. Wire this in `src/lib/startup.ts` / wherever `registerTools` is called,
reading the customizable flag.

### 4.5 System prompt — rewrite the forbidding rules
`src/contexts/krishna.context.tsx`, `SYSTEM_PROMPT_RULES`:
- **Delete/replace rule 6** ("NEVER do a 2-step open-terminal-then-type plan…").
- **Rewrite rule 9** ("Krishna cannot type into it afterwards") to describe the new capability.
- Add new rules, e.g.:
  - *"To type into an already-open window, use a plan: `open_target` (if the app isn't open) then
    `computer_type` with the text, then `computer_key` with `enter`. These require user confirmation."*
  - *"Only use `computer_*` tools when the user explicitly asks you to type/click/control something.
    Never use them to fill passwords or payment fields."*
- Update the `MULTI-STEP TASK PLANNING` example to show a `computer_type` + `computer_key` plan, e.g.
  open cmd → type `opencode` → press enter.
- These tools auto-appear in the "Available tools:" section via `buildToolsSection()` /
  `getAllTools()` once registered — no manual prompt listing needed.

### 4.6 Settings UI
Add the toggle (Settings → likely a "Computer Control" or "Advanced" section), with the warning copy.
Calls `set_computer_control_enabled` (Rust) + persists to `CustomizableState`. On toggle-on, consider
a one-time modal explaining the risk and (macOS) triggering the Accessibility permission check.

---

## 5. Testing & verification

- **Unit (core):** `classifyAction("computer_type")` → `"sensitive"`; with no confirmer wired, the
  tool `run()` returns `{success:false, error:"User declined"}` (fail-safe). Add to the existing
  vitest suite alongside the action-policy tests.
- **Executor:** a plan containing `computer_type` is NOT hard-rejected by the executor (prefix
  exemption works) and instead routes to the tool's own confirmation.
- **Flag off:** Rust `computer_type` returns the "disabled" error even if called directly (defense in
  depth) — test by invoking with the flag off.
- **Manual (Windows, the daily driver):**
  1. Enable the flag in Settings.
  2. Say/type: "open command prompt, then type opencode and press enter".
  3. Expect: cmd opens → Krishna asks "Type `opencode` and press Enter into the focused window —
     confirm?" → on "yes", `opencode` is typed into cmd and Enter is pressed.
  4. Say "no" → nothing is typed.
  5. Disable the flag → the AI no longer offers to type (tool not registered) and direct invoke is
     refused.
- **Kill switch:** start a plan, hit `Esc` mid-sequence → remaining steps abort.
- `npm run typecheck` + `npm test` (client) green; `npm run build` green; `cargo check` (the new crate
  compiles on Windows).

---

## 6. Risks & residual issues (call out in the PR description)

1. **No focused-field awareness in Phase 1** — Krishna types wherever focus happens to be. If the user
   confirms while a password field is focused, the secret gets typed. Mitigated only by the
   confirmation copy's warning. Real fix is Phase 2 (screen-aware) + field detection.
2. **`computer_focus_window` is platform-hairy** — if it balloons the diff, ship without it and rely on
   the user focusing the target window before confirming. Document clearly.
3. **macOS Accessibility / Linux Wayland** — capability is degraded/unavailable; detect and tell the
   user instead of silently no-op-ing.
4. **Prompt-injection** is currently low (Phase 1 only acts on explicit user text, not screen
   contents). It becomes a primary threat in Phase 2 — gate that behind its own plan + review.

---

## 7. Out of scope (explicit)

- Screen-aware vision loop (Phase 2) — separate plan.
- Recording/replaying macros.
- Remote control from the mobile client (mobile has no desktop to control).
- Any change to the encryption salt / keychain keys (see `REBRAND_CLEANUP_HANDOFF.md` DO-NOT-TOUCH).
