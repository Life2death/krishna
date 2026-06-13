import { invoke } from "@tauri-apps/api/core";
import type { Action, ParsedReply } from "@/types/assistant";
import { resolveAppAlias, isUrl, isFilePath } from "@/config/app-aliases";
import { resolveTarget, saveAndConfirm, needsConfirmation } from "@/lib/resolver";
import type { ResolveResult } from "@/lib/resolver";

const ACTION_REGEX = /```action\n([\s\S]*?)```/;
const JSON_BLOCK_REGEX = /```json\n([\s\S]*?)```/;

export function parseActions(reply: string): ParsedReply {
  let spokenText = reply;
  const actions: Action[] = [];

  const actionMatch = reply.match(ACTION_REGEX);
  if (actionMatch) {
    try {
      const parsed = JSON.parse(actionMatch[1].trim());
      if (parsed && parsed.action === "open" && parsed.target) {
        actions.push({ action: "open", target: parsed.target });
      }
    } catch {
      // Not valid JSON, ignore
    }
    spokenText = spokenText.replace(actionMatch[0], "").trim();
  }

  const jsonMatch = reply.match(JSON_BLOCK_REGEX);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (parsed && parsed.action === "open" && parsed.target) {
        actions.push({ action: "open", target: parsed.target });
      }
    } catch {
      // Not valid JSON, ignore
    }
    spokenText = spokenText.replace(jsonMatch[0], "").trim();
  }

  return { spokenText, actions };
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
      const url = rawTarget.startsWith("http") ? rawTarget : `https://${rawTarget}`;
      try {
        await invoke("open_target", { target: url });
        return { spokenResponse: `Opening ${rawTarget}` };
      } catch {
        return { spokenResponse: `Failed to open ${rawTarget}` };
      }
    }

    if (isFilePath(rawTarget)) {
      try {
        await invoke("open_target", { target: rawTarget });
        return { spokenResponse: `Opening file path` };
      } catch {
        return { spokenResponse: `Failed to open path` };
      }
    }

    const alias = resolveAppAlias(lowerTarget);
    if (alias) {
      try {
        await invoke("open_target", { target: alias.launchCommand });
        return { spokenResponse: `Opening ${alias.name}` };
      } catch {
        return { spokenResponse: `Failed to open ${alias.name}` };
      }
    }

    const result = await resolveTarget(rawTarget, llmFallback);
    if (result.found && result.target) {
      const id = await saveAndConfirm(result, rawTarget);
      if (needsConfirmation(result)) {
        return {
          spokenResponse: `I found ${result.displayName}. Should I open it?`,
          needsConfirmation: true,
          pendingResult: result,
          learnedActionId: id ?? undefined,
          input: rawTarget,
        };
      }
      await invoke("open_target", { target: result.target });
      return { spokenResponse: `Opening ${result.displayName}` };
    }

    return { spokenResponse: `I couldn't find an app named "${rawTarget}"` };
  }

  return { spokenResponse: "Unknown action" };
}
