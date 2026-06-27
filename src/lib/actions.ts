import { invoke } from "@tauri-apps/api/core";
import type { Action, ParsedReply, StepAction } from "@/types/assistant";
import { resolveAppAlias, isUrl, isFilePath } from "@/config/app-aliases";
import { resolveTarget, saveAndConfirm, needsConfirmation } from "@/lib/resolver";
import type { ResolveResult } from "@/lib/resolver";

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
        if (parsed && parsed.action === "open" && parsed.target) {
          actions.push({ action: "open", target: parsed.target });
        }
        if (parsed && parsed.action === "remember" && parsed.value) {
          actions.push({ action: "remember", key: parsed.key ?? null, value: parsed.value });
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

  return { spokenResponse: "Unknown action" };
}

/** Resolve an action to a confirmable pendingResult without executing it.
 *  Used for unverified-speaker gating: always returns needsConfirmation=true
 *  with a proper ResolveResult (has .target, .displayName, .found) so the
 *  accept handler can execute it on "yes".
 */
export async function resolveActionForConfirm(
  action: Action,
  llmFallback?: LlmFallbackFn
): Promise<ExecuteActionResult> {
  if (action.action === "open") {
    const rawTarget = action.target.trim();
    const lowerTarget = rawTarget.toLowerCase();

    if (isUrl(rawTarget)) {
      const url = rawTarget.startsWith("http") ? rawTarget : "https://" + rawTarget;
      return {
        spokenResponse: "Open " + rawTarget + "?",
        needsConfirmation: true,
        pendingResult: { found: true, target: url, displayName: rawTarget, source: "direct" } as ResolveResult,
        input: rawTarget,
      };
    }

    if (isFilePath(rawTarget)) {
      return {
        spokenResponse: "Open " + rawTarget + "?",
        needsConfirmation: true,
        pendingResult: { found: true, target: rawTarget, displayName: rawTarget, source: "direct" } as ResolveResult,
        input: rawTarget,
      };
    }

    const alias = resolveAppAlias(lowerTarget);
    if (alias) {
      return {
        spokenResponse: "Open " + alias.name + "?",
        needsConfirmation: true,
        pendingResult: { found: true, target: alias.launchCommand, displayName: alias.name, source: "alias" } as ResolveResult,
        input: rawTarget,
      };
    }

    const result = await resolveTarget(rawTarget, llmFallback);
    if (result.found && result.target) {
      return {
        spokenResponse: "I found " + result.displayName + ". Should I open it?",
        needsConfirmation: true,
        pendingResult: result,
        input: rawTarget,
      };
    }

    return { spokenResponse: "I couldn't find an app named \"" + rawTarget + "\"" };
  }

  return { spokenResponse: "Unknown action" };
}