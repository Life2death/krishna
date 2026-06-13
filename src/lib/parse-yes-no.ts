export type YesNoAnswer = "yes" | "no" | "ambiguous";

const YES_WORDS = new Set([
  "yes", "yeah", "yep", "sure", "okay", "ok", "alright", "fine",
  "go ahead", "do it", "please", "yup", "correct", "right",
]);

const NO_WORDS = new Set([
  "no", "nope", "nah", "cancel", "stop", "dont", "don't",
  "not", "never", "forget it", "skip", "no thanks",
]);

export function parseYesNo(text: string): YesNoAnswer {
  const cleaned = text.trim().toLowerCase().replace(/[^a-z0-9\s']/g, "").replace(/\s+/g, " ").trim();

  if (YES_WORDS.has(cleaned)) return "yes";
  if (NO_WORDS.has(cleaned)) return "no";

  const words = cleaned.split(/\s+/);
  if (words.length <= 3) {
    if (words.some((w) => YES_WORDS.has(w))) return "yes";
    if (words.some((w) => NO_WORDS.has(w))) return "no";
  }

  return "ambiguous";
}
