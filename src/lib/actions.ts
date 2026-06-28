import { invoke } from "@tauri-apps/api/core";
import type { Action, ParsedReply, StepAction } from "@/types/assistant";
import { resolveAppAlias, isUrl, isFilePath } from "@/config/app-aliases";
import { resolveTarget, saveAndConfirm, needsConfirmation } from "@/lib/resolver";
import type { ResolveResult } from "@/lib/resolver";
import { isAndroid } from "@/lib/platform";

const ACTION_REGEX = /```action\n([\s\S]*?)```/g;
const JSON_BLOCK_REGEX = /```json\n([\s\S]*?)```/g;
const PLAN_REGEX = /```plan\n([\s\S]*?)```/;

export function parseActions(reply: string): ParsedReply {
  let spokenText = reply;
  const actions: Action[] = [];
  let plan: { say: string; needsConfirmation: boolean; steps: StepAction[] } | undefined;

  const planMatch = reply.match(PLAN_REGEX);
  if (planMatch) {
    try {
      const parsed = JSON.parse(planMatch[1].trim());
      if (parsed && parsed.say && Array.isArray(parsed.plan)) {
        plan = {
          say: parsed.say,
          needsConfirmation: parsed.needsConfirmation !== false,
          steps: parsed.plan.map((step: any) => ({
            tool: step.tool,
            args: step.args || {},
            out: step.out,
          })),
        };
        if (plan.steps.length === 1 && plan.steps[0].tool === "open_target") {
          const target = plan.steps[0].args.target || "";
          actions.push({ action: "open", target });
        }
      }
    } catch {
      // Not valid JSON, ignore
    }
    spokenText = spokenText.replace(planMatch[0], "").trim();
  }

  if (!plan) {
    // Collect all action blocks (both ```action and ```json)
    const allBlocks = [...reply.matchAll(ACTION_REGEX), ...reply.matchAll(JSON_BLOCK_REGEX)];
    for (const match of allBlocks) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (!parsed || !parsed.action) continue;
        const a = parsed.action;
        if (a === "open" && parsed.target) {
          actions.push({ action: "open", target: parsed.target });
        } else if (a === "remember" && parsed.value) {
          actions.push({ action: "remember", key: parsed.key ?? null, value: parsed.value });
        } else if (a === "set_torch" && typeof parsed.on === "boolean") {
          actions.push({ action: "set_torch", on: parsed.on });
        } else if (a === "list_apps") {
          actions.push({ action: "list_apps" });
        } else if (a === "launch_app" && parsed.packageName) {
          actions.push({ action: "launch_app", packageName: parsed.packageName });
        } else if (a === "open_setting" && parsed.name) {
          actions.push({ action: "open_setting", name: parsed.name, packageName: parsed.packageName });
        } else if (a === "set_volume" && typeof parsed.level === "number") {
          actions.push({ action: "set_volume", stream: parsed.stream, level: parsed.level });
        } else if (a === "set_dnd" && parsed.filter) {
          actions.push({ action: "set_dnd", filter: parsed.filter });
        } else if (a === "request_bluetooth_enable") {
          actions.push({ action: "request_bluetooth_enable" });
        }
      } catch {
        // Not valid JSON, ignore
      }
      spokenText = spokenText.replace(match[0], "").trim();
    }
  }

  return { spokenText, actions, plan };
}

export interface ExecuteActionResult {
  spokenResponse: string;
  needsConfirmation?: boolean;
  pendingResult?: ResolveResult;
  learnedActionId?: string;
  input?: string;
}

type LlmFallbackFn = (input: string) => Promise<string | null>;

export async function executeAction(
  action: Action,
  llmFallback?: LlmFallbackFn
): Promise<ExecuteActionResult> {
  if (action.action === "open") {
    const rawTarget = action.target.trim();
    const lowerTarget = rawTarget.toLowerCase();

    if (isUrl(rawTarget)) {
      const url = rawTarget.startsWith("http") ? rawTarget : "https://" + rawTarget;
      try {
        await invoke("open_target", { target: url });
        return { spokenResponse: "Opening " + rawTarget };
      } catch {
        return { spokenResponse: "Failed to open " + rawTarget };
      }
    }

    if (isFilePath(rawTarget)) {
      try {
        await invoke("open_target", { target: rawTarget });
        return { spokenResponse: "Opening file path" };
      } catch {
        return { spokenResponse: "Failed to open path" };
      }
    }

    const alias = resolveAppAlias(lowerTarget);
    if (alias) {
      try {
        await invoke("open_target", { target: alias.launchCommand });
        return { spokenResponse: "Opening " + alias.name };
      } catch {
        return { spokenResponse: "Failed to open " + alias.name };
      }
    }

    const result = await resolveTarget(rawTarget, llmFallback);
    if (result.found && result.target) {
      if (needsConfirmation(result)) {
        return {
          spokenResponse: "I found " + result.displayName + ". Should I open it?",
          needsConfirmation: true,
          pendingResult: result,
          input: rawTarget,
        };
      }
      await saveAndConfirm(result, rawTarget);
      await invoke("open_target", { target: result.target });
      return { spokenResponse: "Opening " + result.displayName };
    }

    return { spokenResponse: "I couldn't find an app named \"" + rawTarget + "\"" };
  }

  // ── Android device-control actions ──────────────────────────────────
  if (!isAndroid()) {
    return { spokenResponse: "That action is only available on an Android device." };
  }

  if (action.action === "set_torch") {
    try {
      await invoke("plugin:device-control|set_torch", { on: action.on });
      return { spokenResponse: action.on ? "Torch turned on" : "Torch turned off" };
    } catch {
      return { spokenResponse: "Failed to toggle torch" };
    }
  }

  if (action.action === "list_apps") {
    return { spokenResponse: "Listing installed apps. Check your dashboard for the list." };
  }

  if (action.action === "launch_app") {
    try {
      await invoke("plugin:device-control|launch_app", { packageName: action.packageName });
      return { spokenResponse: "Launching app" };
    } catch {
      return { spokenResponse: "Failed to launch " + action.packageName };
    }
  }

  if (action.action === "open_setting") {
    try {
      await invoke("plugin:device-control|open_setting", { name: action.name, packageName: action.packageName });
      return { spokenResponse: "Opening " + action.name + " settings" };
    } catch {
      return { spokenResponse: "Failed to open " + action.name + " settings" };
    }
  }

  if (action.action === "set_volume") {
    try {
      await invoke("plugin:device-control|set_volume", { stream: action.stream, level: action.level });
      return { spokenResponse: "Volume set to " + action.level };
    } catch {
      return { spokenResponse: "Failed to set volume" };
    }
  }

  if (action.action === "set_dnd") {
    try {
      await invoke("plugin:device-control|set_dnd", { filter: action.filter });
      return { spokenResponse: "Do Not Disturb set to " + action.filter };
    } catch {
      return { spokenResponse: "Failed to set Do Not Disturb" };
    }
  }

  if (action.action === "request_bluetooth_enable") {
    try {
      await invoke("plugin:device-control|request_bluetooth_enable");
      return { spokenResponse: "Requesting Bluetooth enable" };
    } catch {
      return { spokenResponse: "Failed to request Bluetooth enable" };
    }
  }

  return { spokenResponse: "Unknown action" };
}