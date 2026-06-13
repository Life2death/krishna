export type ActionCategory = "safe" | "sensitive";

const KNOWN_SAFE: ReadonlySet<string> = new Set([
  "open",
  "look",
  "youtube_search",
  "web_search",
  "memory_write",
  "open_target",
]);

export function classifyAction(actionType: string): ActionCategory {
  return KNOWN_SAFE.has(actionType) ? "safe" : "sensitive";
}
