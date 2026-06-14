# Plan: Shell Command Execution for Krishna

## Context

Krishna already has a complete action-dispatch pipeline:
- `src-tauri/src/assistant.rs` — `open_target` Rust command (opens URLs, paths, apps via `cmd /C start`)
- `src/lib/tools/index.ts` — Tool registry (`open_target`, `youtube_search`, `web_search`)
- `src/lib/executor.ts` — Multi-step plan executor with `${var}` substitution
- `src/contexts/krishna.context.tsx` — System prompt with action protocol, plan execution, confirmation flow
- `src/config/action-policy.ts` — Classifies tools as safe/sensitive (sensitive requires confirmation)

**The problem the user hit:**
The user said "open command prompt and type code". The LLM interpreted this as:
1. `open_target` → opened `cmd`
2. Some attempt to type into it → silently failed (no such mechanism exists)
3. LLM said "done" anyway (hallucination)

**The right design:**
- "Open VS Code at my repo" → `run_shell_command` with `code D:\path\to\repo` — runs directly, no visible terminal needed
- "Run git pull" → `run_shell_command` with `git -C D:\path\to\repo pull` — runs and returns output
- "Open a command prompt" → `open_target` with `cmd` or `wt` (Windows Terminal) — opens an empty terminal for the user
- There is NO mechanism to type into a terminal Krishna opened. Don't try to implement that — it's fragile and unnecessary. Run commands directly via Rust instead.

---

## What to build

### 1. Rust command: `run_shell_command` — `src-tauri/src/assistant.rs`

Add after the existing `open_target` function:

```rust
/// Execute a shell command and return its stdout. stderr is merged into the result.
/// Windows: runs via cmd /C <command>
/// macOS/Linux: runs via sh -c <command>
///
/// SECURITY: This command is sensitive — it must only be callable after user confirmation
/// (enforced by the action-policy gate in executor.ts). The command string is NOT
/// passed to a shell with arbitrary escaping — we use cmd /C on Windows which still
/// has injection surface, so the frontend must only call this after confirmation.
#[tauri::command]
pub fn run_shell_command(command: String) -> Result<String, String> {
    // Hard limit: don't run commands longer than 500 chars (guards against prompt injection)
    if command.len() > 500 {
        return Err("Command too long (max 500 chars)".to_string());
    }

    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("cmd")
        .args(["/C", &command])
        .output()
        .map_err(|e| format!("Failed to run command: {}", e))?;

    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("sh")
        .args(["-c", &command])
        .output()
        .map_err(|e| format!("Failed to run command: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        let result = if stdout.trim().is_empty() {
            format!("Command completed successfully.")
        } else {
            stdout.trim().to_string()
        };
        Ok(result)
    } else {
        let detail = if stderr.trim().is_empty() { stdout.trim().to_string() } else { stderr.trim().to_string() };
        Err(format!("Command failed (exit {:?}): {}", output.status.code(), detail))
    }
}
```

### 2. Register in `src-tauri/src/lib.rs`

Find the `invoke_handler` macro call (it lists all `#[tauri::command]` functions). Add `assistant::run_shell_command` to the list alongside `assistant::open_target`.

Example — if the current line reads:
```rust
assistant::open_target,
```
Change to:
```rust
assistant::open_target,
assistant::run_shell_command,
```

Grep for `open_target` in `lib.rs` to find the exact location.

### 3. Frontend tool: `src/lib/tools/run-shell-command.ts`

Create new file:

```typescript
import { invoke } from "@tauri-apps/api/core";
import type { Tool } from "./index";

/**
 * Run a shell command via Rust and return its stdout.
 * Classified as "sensitive" in action-policy — requires user confirmation before execution.
 * The `command` arg is the full command string (e.g. "code D:\\Learning\\krishna").
 */
export const runShellCommandTool: Tool = {
  name: "run_shell_command",
  description:
    "Run a shell command and return its output. Use for: opening VS Code at a path (code <path>), running git commands, npm commands, or any CLI tool. Requires confirmation.",
  run: async (args, _ctx) => {
    const command = args.command;
    if (!command) {
      return { success: false, error: "Missing required arg: command" };
    }
    try {
      const result = await invoke<string>("run_shell_command", { command });
      return { success: true, output: result, data: { output: result } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  },
};
```

### 4. Register tool in `src/lib/tools/index.ts`

Add import and register call:

```typescript
import { runShellCommandTool } from "./run-shell-command";
// ... existing imports ...

register(runShellCommandTool);
// keep existing: register(openTargetTool); register(youtubeSearchTool); register(webSearchTool);
```

### 5. Mark as sensitive in `src/config/action-policy.ts`

Read this file first to see the existing pattern, then add `run_shell_command` to the sensitive list. If the file doesn't exist yet, create it:

```typescript
const SENSITIVE_TOOLS = new Set(["run_shell_command"]);

export function classifyAction(toolName: string): "safe" | "sensitive" {
  return SENSITIVE_TOOLS.has(toolName) ? "sensitive" : "safe";
}
```

If the file already exists, just add `"run_shell_command"` to the sensitive set.

### 6. Update the system prompt in `src/contexts/krishna.context.tsx`

The `KRISHNA_SYSTEM_PROMPT` constant (line ~66) already lists tools via `getToolDescriptions()`. The new tool auto-appears there. **But add one clarifying rule** to the Rules section (line ~101):

Add after rule 5:
```
6. NEVER try to open a terminal and then type into it — there is no mechanism to type into a terminal Krishna opened. To run a command (git, code, npm), use run_shell_command directly. run_shell_command always requires confirmation, so the user sees and approves what will run.
7. For "open VS Code at my repo" → run_shell_command with command: "code D:\\path\\to\\repo"
8. For "open a terminal for me" → open_target with target: "wt" (Windows Terminal) or "cmd". This just opens it — Krishna cannot type into it.
```

---

## Common use cases after this is built

| Voice command | What Krishna does |
|---|---|
| "Open VS Code at my Krishna repo" | `run_shell_command: code D:\Learning\krishna` (with confirmation) |
| "Run git pull on the krishna repo" | `run_shell_command: git -C D:\Learning\krishna pull` (with confirmation) |
| "Open a command prompt" | `open_target: wt` or `open_target: cmd` (no typing) |
| "Open YouTube" | `open_target: https://youtube.com` (unchanged) |
| "Run npm install" | `run_shell_command: npm install --prefix D:\Learning\krishna` (with confirmation) |
| "What's the git status of krishna" | `run_shell_command: git -C D:\Learning\krishna status` → speaks the output |

---

## Verification steps

1. `npx tsc --noEmit` → must stay clean.
2. `npm run tauri dev` → app launches (Rust recompile needed after assistant.rs change).
3. Say "open VS Code at D backslash Learning backslash krishna" → Krishna asks "Should I run: code D:\Learning\krishna?" → say yes → VS Code opens at that folder.
4. Say "what's the git status of my krishna repo" → Krishna asks confirmation → say yes → speaks the git status output.
5. Say "open a terminal" → terminal window opens; Krishna does NOT attempt to type into it.
6. Verify run_shell_command does NOT appear in executePlan without confirmation (action-policy gate in executor.ts line ~50).

---

## Files to touch (summary)

| File | Change |
|---|---|
| `src-tauri/src/assistant.rs` | Add `run_shell_command` Rust fn |
| `src-tauri/src/lib.rs` | Register `run_shell_command` in invoke_handler |
| `src/lib/tools/run-shell-command.ts` | New file — frontend tool wrapper |
| `src/lib/tools/index.ts` | Import + register `runShellCommandTool` |
| `src/config/action-policy.ts` | Add `run_shell_command` to sensitive set |
| `src/contexts/krishna.context.tsx` | Add rules 6-8 to KRISHNA_SYSTEM_PROMPT |

**Do NOT touch:** executor.ts, actions.ts, KrishnaVAD.tsx, tauri.conf.json, or any DB/migration files.
