import type { CreateUpgradeTaskInput, UpgradePlatform } from "./types/upgrade";

export interface ParsedUpgradeCommand {
  intent: "create" | "list" | "analyze_next" | "approve";
  requestText?: string;
}

const CREATE_PATTERNS = [
  /^improve yourself so(?: that)?\s+(.+)$/i,
  /^improve krishna so(?: that)?\s+(.+)$/i,
  /^self improvement[:\s]+(.+)$/i,
  /^flag this for self improvement$/i,
  /^flag this for self-improvement$/i,
];

export function parseUpgradeCommand(input: string): ParsedUpgradeCommand | null {
  const text = input.trim();
  if (!text) return null;

  if (/^what upgrades are pending\??$/i.test(text) || /^show pending upgrades\??$/i.test(text)) {
    return { intent: "list" };
  }
  if (/^analyze the next upgrade now\.?$/i.test(text)) {
    return { intent: "analyze_next" };
  }
  if (/^approve .+implementation\.?$/i.test(text)) {
    return { intent: "approve" };
  }

  for (const pattern of CREATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const requestText = (match[1] ?? "").trim();
      return { intent: "create", requestText: requestText || text };
    }
  }
  return null;
}

export function summarizeUpgradeTitle(requestText: string): string {
  const cleaned = requestText
    .replace(/^krishna\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Self-improvement request";
  const words = cleaned.split(" ").slice(0, 9).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function validateCreateUpgradeTaskInput(input: CreateUpgradeTaskInput): void {
  if (!input.requestText.trim()) {
    throw new Error("Upgrade request text is required");
  }
  if (input.priority && !["low", "normal", "high"].includes(input.priority)) {
    throw new Error("Invalid upgrade priority");
  }
  if (input.providerPolicy && !["codex", "claude", "codex_plus_claude"].includes(input.providerPolicy)) {
    throw new Error("Invalid upgrade provider policy");
  }
  if (input.source && !["voice", "text", "manual"].includes(input.source)) {
    throw new Error("Invalid upgrade source");
  }
  if (input.platform && !["desktop", "android", "unknown"].includes(input.platform)) {
    throw new Error("Invalid upgrade platform");
  }
}

export function createLocalUpgradeDraft(
  requestText: string,
  source: CreateUpgradeTaskInput["source"],
  platform: UpgradePlatform,
  originCommandLogId?: string | null,
): CreateUpgradeTaskInput {
  const title = summarizeUpgradeTitle(requestText);
  return {
    requestText,
    title,
    normalizedGoal: requestText.trim(),
    acceptanceCriteria: [
      "The change is visible and usable on Android and desktop where applicable.",
      "The implementation requires explicit user approval before any provider writes code.",
      "The task remains local-only until cross-device sync is enabled.",
    ],
    area: "Self-improvement",
    priority: "normal",
    source,
    originCommandLogId: originCommandLogId ?? null,
    context: {},
    platform,
    providerPolicy: "codex_plus_claude",
  };
}
