import type { Memory } from "@/types";

export function parseRememberCommand(command: string): { key: string | null; value: string } | null {
  const match = command.match(/^remember that(?:\s+my)?\s+(.+?)\s+is\s+(.+)$/i);
  if (!match) return null;
  const key = match[1].trim();
  const value = match[2].trim();
  if (!value) return null;
  return { key, value };
}

export function buildMemoryPrompt(basePrompt: string, memories: Memory[]): string {
  const confirmed = memories.filter(m => m.confirmed && m.value);
  if (confirmed.length === 0) return basePrompt;
  const memoryBlock = confirmed
    .map(m => "- " + (m.key ? m.key + ": " : "") + m.value)
    .join("\n");
  return basePrompt + "\n\nThings I know about the user:\n" + memoryBlock + "\n\nUse these facts when relevant.";
}