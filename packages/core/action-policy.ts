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
 * Verbs that indicate a read-only / safe operation.
 * Matched against the first segment of the tool name (split on `_` or `.`).
 */
const SAFE_VERBS: ReadonlySet<string> = new Set([
  "search", "list", "get", "read", "lookup", "find", "query", "browse", "peek",
]);

/**
 * Verbs that are ALWAYS sensitive regardless of prefix.
 * Overrides any safe-verb match.
 */
const DESTRUCTIVE_VERBS: ReadonlySet<string> = new Set([
  "delete", "remove", "drop", "truncate",
  "write", "create", "update", "upsert", "insert", "set",
  "send", "post", "put", "patch",
  "exec", "run", "execute", "spawn", "launch",
  "stop", "kill", "terminate", "shutdown", "restart",
  "transfer", "move", "rename", "copy",
  "clear", "purge", "wipe", "reset",
]);

function firstVerb(name: string): string {
  return name.split(/[_.\s-]/)[0].toLowerCase();
}

export function classifyAction(actionType: string): ActionCategory {
  if (KNOWN_SAFE.has(actionType)) return "safe";

  if (actionType.startsWith("mcp_")) {
    const coreName = actionType.slice(4);
    const verb = firstVerb(coreName);
    if (DESTRUCTIVE_VERBS.has(verb)) return "sensitive";
    if (SAFE_VERBS.has(verb)) return "safe";
    return "sensitive";
  }

  return "sensitive";
}
