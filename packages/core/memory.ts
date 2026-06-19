import type { Memory } from "./types";

export function parseRememberCommand(command: string): { key: string | null; value: string } | null {
  const trimmed = command.trim();
  if (!trimmed) return null;

  // Form 1: verb-led with "is" or "=" separator
  // "remember/save/store/note [that] [my] <key> is/= <value>"
  // Requires space before separator (avoids matching URLs or substring "is").
  const isMatch = trimmed.match(/^(?:remember|note|save|store)\s+(?:that\s+)?(?:my\s+)?(.+?)\s+(?:is\s+|=\s*)(.+)$/i);
  if (isMatch) {
    let key = isMatch[1].trim();
    const value = isMatch[2].trim();
    if (!value) return null;
    // Drop leading "this" or "that" noise word from key
    key = key.replace(/^(?:this|that)(?:\s+|$)/i, "").trim();
    return { key: key || null, value };
  }

  // Form 2: "as" form — value before key
  // "remember/save/store/note [this/that] <value> as <key>"
  const asMatch = trimmed.match(/^(?:remember|note|save|store)\s+(?:this\s+|that\s+)?(.+?)\s+as\s+(.+)$/i);
  if (asMatch) {
    const value = asMatch[1].trim();
    const key = asMatch[2].trim();
    if (!value) return null;
    // If key contains a URL, don't eat it — let the LLM handle this case
    if (/:\/\//.test(key)) return null;
    return { key: key || null, value };
  }

  return null;
}

export function buildMemoryPrompt(basePrompt: string, memories: Memory[]): string {
  const confirmed = memories.filter(m => m.confirmed && m.value);
  if (confirmed.length === 0) return basePrompt;
  const memoryBlock = confirmed
    .map(m => "- " + (m.key ? m.key + ": " : "") + m.value)
    .join("\n");
  return basePrompt + "\n\nThings I know about the user:\n" + memoryBlock + "\n\nUse these facts when relevant.";
}
