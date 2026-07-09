export const LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  english:
    "Speak in English with a warm conversational tone. Keep responses concise and natural.",
  hindi:
    "Speak in natural Indian Hindi with a warm conversational tone. Use Devanagari pronunciation when speaking Hindi words. Keep responses concise and avoid an American accent where possible.",
  marathi:
    "Speak in natural Marathi with a warm Maharashtrian conversational tone. Use Devanagari pronunciation when speaking Marathi words. Keep responses concise and avoid an American accent where possible.",
  hinglish:
    "Speak in natural Indian Hinglish. Mix English and Hindi only when it feels conversational. Keep responses concise and friendly.",
};

export const LENGTH_INSTRUCTIONS: Record<string, string> = {
  short:
    "Keep responses extremely brief. Limit to 2-4 sentences maximum. Provide only the most essential information.",
  medium:
    "Provide responses with moderate length. Keep to 1-2 paragraphs with key details. Stay focused.",
  auto:
    "Adjust response length based on the question. Be brief for simple questions, detailed for complex ones.",
};

export function generateLiveInstructions(
  language: string,
  persona?: string,
  responseLength?: string,
  memoryBlock?: string,
): string {
  const parts: string[] = [];

  const basePersona =
    persona && persona.trim()
      ? persona.trim()
      : "You are Krishna, an AI desktop assistant. You help with tasks, answer questions, and control applications.";

  parts.push(basePersona);

  const langInstruction = LANGUAGE_INSTRUCTIONS[language];
  if (langInstruction) {
    parts.push(langInstruction);
  }

  if (responseLength && responseLength !== "auto") {
    const lenInstruction = LENGTH_INSTRUCTIONS[responseLength];
    if (lenInstruction) {
      parts.push(lenInstruction);
    }
  }

  parts.push(
    "You have access to tools for web search, Gmail, travel, window control, and more. Use them when appropriate.",
  );

  if (memoryBlock && memoryBlock.trim()) {
    parts.push(
      "Things you know about the user (reference these naturally when relevant):\n" +
        memoryBlock.trim(),
    );
  }

  return parts.join("\n\n");
}
