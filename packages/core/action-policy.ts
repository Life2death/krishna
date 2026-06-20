export type ActionCategory = "safe" | "sensitive";

const KNOWN_SAFE: ReadonlySet<string> = new Set([
  "open",
  "look",
  "youtube_search",
  "web_search",
  "memory_write",
  "open_target",
]);

/**
 * MCP tools whose names contain these keywords are considered safe.
 * Everything else is sensitive and requires confirmation.
 */
const MCP_SAFE_PATTERNS: ReadonlyArray<RegExp> = [
  /^search/i,
  /^list/i,
  /^get/i,
  /^read/i,
  /^lookup/i,
  /^find/i,
  /^query/i,
];

export function classifyAction(actionType: string): ActionCategory {
  if (KNOWN_SAFE.has(actionType)) return "safe";

  if (actionType.startsWith("mcp_")) {
    const coreName = actionType.slice(4);
    for (const pattern of MCP_SAFE_PATTERNS) {
      if (pattern.test(coreName)) return "safe";
    }
    return "sensitive";
  }

  return "sensitive";
}
