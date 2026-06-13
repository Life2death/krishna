import { invoke } from "@tauri-apps/api/core";
import type { Action, ParsedReply } from "@/types/assistant";
import { resolveAppAlias, isUrl, isFilePath } from "@/config/app-aliases";

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

export async function executeAction(action: Action): Promise<string> {
  if (action.action === "open") {
    const target = action.target.toLowerCase().trim();

    if (isUrl(target)) {
      const url = target.startsWith("http") ? target : `https://${target}`;
      try {
        await invoke("open_target", { target: url });
        return `Opening ${target}`;
      } catch (e) {
        return `Failed to open ${target}`;
      }
    }

    if (isFilePath(target)) {
      try {
        await invoke("open_target", { target });
        return `Opening file path`;
      } catch (e) {
        return `Failed to open path`;
      }
    }

    const alias = resolveAppAlias(target);
    if (alias) {
      try {
        await invoke("open_target", { target: alias.launchCommand });
        return `Opening ${alias.name}`;
      } catch (e) {
        return `Failed to open ${alias.name}`;
      }
    }

    return `I couldn't find an app named "${target}"`;
  }

  return "Unknown action";
}
