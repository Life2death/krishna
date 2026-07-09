import type { Action } from "@/types/assistant";

export interface FastCommand {
  action: Action;
  reason: "open" | "window" | "saved_search";
}

const FILLER_WORDS = /^(?:please|kindly)\s+/i;
const OPEN_RE = /^(?:open|launch|start)\s+(.+)$/i;
const FOCUS_RE = /^(?:bring|focus|switch\s+to)\s+(.+?)(?:\s+(?:to|in)\s+(?:front|foreground))?$/i;
const MOVE_RE = /^move\s+(.+?)\s+to\s+(?:the\s+)?(.+?)(?:\s+monitor|\s+screen)?$/i;
const SAVED_SEARCH_RE = /^(?:open\s+)?(?:my\s+)?(.+?)\s+(?:saved\s+)?search$/i;
const NAUKRI_SEARCH_RE = /^(?:open\s+)?(?:naukri|linkedin)\s+(?:for\s+)?(.+)$/i;

function cleanTarget(value: string): string {
  return value
    .replace(FILLER_WORDS, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "")
    .trim();
}

function normalizeMonitor(value: string): string {
  const lower = cleanTarget(value).toLowerCase();
  if (/\b(other|next|another)\b/.test(lower)) return "next";
  if (/\bleft\b/.test(lower)) return "left";
  if (/\bright\b/.test(lower)) return "right";
  if (/\bprimary|main\b/.test(lower)) return "primary";
  return lower;
}

export function parseFastCommand(input: string): FastCommand | null {
  const command = cleanTarget(input);
  if (!command) return null;

  const savedSearchMatch = command.match(SAVED_SEARCH_RE) || command.match(NAUKRI_SEARCH_RE);
  if (savedSearchMatch?.[1]) {
    const target = cleanTarget(savedSearchMatch[1]);
    if (target) {
      return { reason: "saved_search", action: { action: "open_saved_search", target } };
    }
  }

  const moveMatch = command.match(MOVE_RE);
  if (moveMatch?.[1] && moveMatch[2]) {
    const target = cleanTarget(moveMatch[1]);
    if (target) {
      return {
        reason: "window",
        action: {
          action: "control_window",
          mode: "move",
          target,
          monitor: normalizeMonitor(moveMatch[2]),
        },
      };
    }
  }

  const focusMatch = command.match(FOCUS_RE);
  if (focusMatch?.[1]) {
    const target = cleanTarget(focusMatch[1]);
    if (target) {
      return { reason: "window", action: { action: "control_window", mode: "focus", target } };
    }
  }

  const openMatch = command.match(OPEN_RE);
  if (openMatch?.[1]) {
    const target = cleanTarget(openMatch[1]);
    if (target && !/\b(search|for)\b/i.test(target)) {
      return { reason: "open", action: { action: "open", target } };
    }
  }

  return null;
}
