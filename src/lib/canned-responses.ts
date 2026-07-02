type CannedIntent = "greeting" | "thanks" | "acknowledgment";

interface CannedEntry {
  patterns: RegExp[];
  responses: Record<string, string[]>;
}

const LANG_DETECT = [
  { lang: "mr", test: /(?:^|\s)(कसं|आहे|नाहीत|होय|नमस्कार)/ui },
  { lang: "hi", test: /(?:^|\s)(कैसे|है|नहीं|हाँ|नमस्ते|धन्यवाद)/ui },
] as const;

function detectLanguage(text: string): string {
  const slice = text.slice(0, 100);
  if (!/[\u0900-\u097F]/.test(slice)) return "en";
  for (const { lang, test } of LANG_DETECT) {
    if (test.test(slice)) return lang;
  }
  return "hi";
}

function stripPunctuation(s: string): string {
  return s.replace(/[^\w\s\u0900-\u097F]/g, "").trim();
}

function wordCount(s: string): number {
  const cleaned = stripPunctuation(s);
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).length;
}

/**
 * Return true only if the ENTIRE utterance (trimmed, ≤4 words) is
 * the greeting/thanks/ack. Prevents substring hijack of real commands.
 */
function isShortUtterance(text: string): boolean {
  const wc = wordCount(text);
  return wc >= 1 && wc <= 4;
}

const EN_OPTIONAL_SUFFIX = /(?:,\s*krishna|\s+krishna|\s+dude|\s+man|\s+boss|\s+there)?/i;

const GREETING_EN = new RegExp(
  "^(?:" +
    "(?:good\\s+)?(morning|afternoon|evening)" +
    "|" +
    "hi" + EN_OPTIONAL_SUFFIX.source +
    "|" +
    "hello" + EN_OPTIONAL_SUFFIX.source +
    "|" +
    "hey" + EN_OPTIONAL_SUFFIX.source +
    "|" +
    "heyy?" + EN_OPTIONAL_SUFFIX.source +
    ")" +
    "\\s*$", "i"
);

const GREETING_HI = /^(?:नमस्ते|नमस्कार|सुप्रभात|शुभ\s*प्रभात)\s*$/u;
const GREETING_MR = /^(?:नमस्कार|सुप्रभात)\s*$/u;

const THANKS_EN = /^(?:thank\s*(?:you|s)|thanks)\s*$/i;
const THANKS_HI = /^धन्यवाद\s*$/u;

const ACK_EN = /^(?:yes|yeah|yep|sure|okay|ok|alright|got\s*it|on\s*it)\s*$/i;
const ACK_HI = /^(?:हाँ|हां|ठीक\s*है|अच्छा)\s*$/u;
const ACK_MR = /^(?:होय|ठीक\s*आहे)\s*$/u;

function matchGreeting(text: string, lang: string): string | null {
  if (!isShortUtterance(text)) return null;
  const cleaned = stripPunctuation(text);
  if (GREETING_EN.test(cleaned)) {
    const pool: Record<string, string[]> = {
      en: [
        "Good morning, {honorific}!",
        "Hello {honorific}, how can I help?",
        "Hey {honorific}, what can I do for you?",
        "Good to see you, {honorific}!",
      ],
      hi: [
        "नमस्ते {honorific}! कैसे हैं आप?",
        "नमस्कार {honorific}!",
        "सुप्रभात {honorific}!",
        "हैलो {honorific}! क्या कर सकता हूँ आपके लिए?",
      ],
      mr: [
        "नमस्कार {honorific}! कसं आहात?",
        "नमस्ते {honorific}!",
        "सुप्रभात {honorific}!",
      ],
    };
    const p = pool[lang] ?? pool["en"];
    return p[Math.floor(Math.random() * p.length)];
  }
  if (GREETING_HI.test(cleaned)) {
    const p: Record<string, string[]> = {
      hi: [
        "नमस्ते {honorific}! कैसे हैं आप?",
        "नमस्कार {honorific}!",
        "सुप्रभात {honorific}!",
      ],
    };
    return (p[lang] ?? p["hi"])[Math.floor(Math.random() * p[lang in p ? lang : "hi"].length)];
  }
  return null;
}

function matchThanks(text: string, lang: string): string | null {
  if (!isShortUtterance(text)) return null;
  const cleaned = stripPunctuation(text);
  if (!THANKS_EN.test(cleaned) && !THANKS_HI.test(cleaned)) return null;
  const pool: Record<string, string[]> = {
    en: [
      "You're welcome, {honorific}!",
      "My pleasure, {honorific}!",
      "Anytime, {honorific}!",
      "Happy to help, {honorific}!",
    ],
    hi: [
      "आपका स्वागत है {honorific}!",
      "मेरी खुशी है {honorific}!",
    ],
    mr: [
      "तुमचं स्वागत आहे {honorific}!",
    ],
  };
  const p = pool[lang] ?? pool["en"];
  return p[Math.floor(Math.random() * p.length)];
}

function matchAcknowledgment(text: string, lang: string): string | null {
  if (!isShortUtterance(text)) return null;
  const cleaned = stripPunctuation(text);
  const matched = ACK_EN.test(cleaned) || ACK_HI.test(cleaned) || ACK_MR.test(cleaned);
  if (!matched) return null;
  const pool: Record<string, string[]> = {
    en: [
      "Yes, {honorific}?",
      "I'm listening, {honorific}.",
    ],
    hi: [
      "हाँ {honorific}?",
      "सुन रहा हूँ {honorific}।",
    ],
    mr: [
      "होय {honorific}?",
    ],
  };
  const p = pool[lang] ?? pool["en"];
  return p[Math.floor(Math.random() * p.length)];
}

export function matchCannedResponse(
  text: string,
  honorific: string,
): { response: string; intent: CannedIntent } | null {
  const lang = detectLanguage(text);
  let reply: string | null;
  let intent: CannedIntent;

  reply = matchGreeting(text, lang);
  if (reply) { intent = "greeting"; }
  else {
    reply = matchThanks(text, lang);
    if (reply) { intent = "thanks"; }
    else {
      reply = matchAcknowledgment(text, lang);
      if (reply) { intent = "acknowledgment"; }
      else return null;
    }
  }

  return { response: reply.replace(/{honorific}/g, honorific), intent };
}
