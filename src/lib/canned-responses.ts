import { pickLine } from "@/lib/voice-lines";

type CannedIntent = "greeting" | "thanks" | "acknowledgment";

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

const THANKS_EN = /^(?:thank\s*(?:you|s)|thanks)\s*$/i;
const THANKS_HI = /^धन्यवाद\s*$/u;

const ACK_EN = /^(?:yes|yeah|yep|sure|okay|ok|alright|got\s*it|on\s*it)\s*$/i;
const ACK_HI = /^(?:हाँ|हां|ठीक\s*है|अच्छा)\s*$/u;
const ACK_MR = /^(?:होय|ठीक\s*आहे)\s*$/u;

async function matchGreeting(text: string, lang: string): Promise<string | null> {
  if (!isShortUtterance(text)) return null;
  const cleaned = stripPunctuation(text);
  if (GREETING_EN.test(cleaned)) {
    return await pickLine("greeting", lang, "{honorific}");
  }
  if (GREETING_HI.test(cleaned)) {
    return await pickLine("greeting", "hi", "{honorific}");
  }
  return null;
}

async function matchThanks(text: string, lang: string): Promise<string | null> {
  if (!isShortUtterance(text)) return null;
  const cleaned = stripPunctuation(text);
  if (THANKS_EN.test(cleaned) || THANKS_HI.test(cleaned)) {
    return await pickLine("thanks_reply", lang, "{honorific}");
  }
  return null;
}

async function matchAcknowledgment(text: string, lang: string): Promise<string | null> {
  if (!isShortUtterance(text)) return null;
  const cleaned = stripPunctuation(text);
  const matched = ACK_EN.test(cleaned) || ACK_HI.test(cleaned) || ACK_MR.test(cleaned);
  if (!matched) return null;
  return await pickLine("wake_ack", lang, "{honorific}");
}

export async function matchCannedResponse(
  text: string,
  honorific: string,
): Promise<{ response: string; intent: CannedIntent } | null> {
  const lang = detectLanguage(text);
  let reply: string | null;
  let intent: CannedIntent;

  reply = await matchGreeting(text, lang);
  if (reply) { intent = "greeting"; }
  else {
    reply = await matchThanks(text, lang);
    if (reply) { intent = "thanks"; }
    else {
      reply = await matchAcknowledgment(text, lang);
      if (reply) { intent = "acknowledgment"; }
      else return null;
    }
  }

  return { response: reply.replace(/{honorific}/g, honorific), intent };
}
