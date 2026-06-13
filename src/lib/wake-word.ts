export interface WakeWordResult {
  detected: boolean;
  remainder: string;
  fullTranscript: string;
}

const WAKE_WORD_PATTERNS = [
  /^(hey\s+)?krishna[\s,;:!.]*/i,
  /^(hey\s+)?krishnaa[\s,;:!.]*/i,
  /^(hey\s+)?krisna[\s,;:!.]*/i,
];

export function detectWakeWord(
  transcript: string,
  customWakeWord?: string
): WakeWordResult {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return { detected: false, remainder: "", fullTranscript: transcript };
  }

  if (customWakeWord && customWakeWord !== "hey krishna") {
    const customPattern = new RegExp(
      `^${escapeRegex(customWakeWord)}[\\s,;:!.]*`,
      "i"
    );
    const match = trimmed.match(customPattern);
    if (match) {
      return {
        detected: true,
        remainder: trimmed.slice(match[0].length).trim(),
        fullTranscript: transcript,
      };
    }
  }

  for (const pattern of WAKE_WORD_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return {
        detected: true,
        remainder: trimmed.slice(match[0].length).trim(),
        fullTranscript: transcript,
      };
    }
  }

  return { detected: false, remainder: "", fullTranscript: transcript };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
