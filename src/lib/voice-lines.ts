import { VoiceCategory, VoiceLineRow, insertLine, getLinesByCategory, getRecentUsedIds, recordLineUsed, ensureVoiceLinesTable } from "@krishna/core/database";

const ANTI_REPEAT_DEPTH = 3;
const TOD_BOOST = 2;
let seeded = false;

function getCurrentTod(): "morning" | "evening" | "late-night" {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "evening";
  return "late-night";
}

function fillSlots(text: string, honorific: string): string {
  return text.replace(/\{honorific\}/g, honorific);
}

function weightedPick(items: VoiceLineRow[], excludeIds: Set<string>, tod: string): VoiceLineRow | null {
  const pool = items.filter(i => !excludeIds.has(i.id));
  if (pool.length === 0) return items.length > 0 ? items[0] : null;

  const totalWeight = pool.reduce((s, i) => {
    let w = i.weight;
    if (i.tod === tod) w *= TOD_BOOST;
    return s + w;
  }, 0);

  let roll = Math.random() * totalWeight;
  for (const item of pool) {
    let w = item.weight;
    if (item.tod === tod) w *= TOD_BOOST;
    roll -= w;
    if (roll <= 0) return item;
  }

  return pool[pool.length - 1];
}

const LANG_FALLBACK: Record<string, string[]> = {
  mr: ["mr", "hi", "en"],
  hi: ["hi", "en"],
  en: ["en"],
};

export async function pickLine(category: VoiceCategory, lang: string, honorific: string): Promise<string> {
  if (!seeded) {
    seeded = true;
    await seedVoiceLines();
  }
  const fallbacks = LANG_FALLBACK[lang] ?? ["en"];

  let item: VoiceLineRow | null = null;
  for (const fb of fallbacks) {
    const lines = await getLinesByCategory(category, fb);
    if (lines.length === 0) continue;

    const recentIds = await getRecentUsedIds(category, ANTI_REPEAT_DEPTH);
    const excludeIds = new Set(recentIds);
    const tod = getCurrentTod();

    item = weightedPick(lines, excludeIds, tod);
    if (item) break;
  }

  if (!item) return fallbackLine(category, honorific);

  await recordLineUsed(item.id);
  return fillSlots(item.text, honorific);
}

function fallbackLine(category: VoiceCategory, honorific: string): string {
  const byCategory: Record<string, string> = {
    filler_wait: "One moment, {honorific}.",
    ack_quick: "Got it, {honorific}.",
    ack_multistep: "On it, {honorific} — give me a minute.",
    confirm_yes_ack: "Sure, {honorific}.",
    decline_ack: "I can't do that, {honorific}.",
    reask: "I didn't catch that, {honorific}.",
    error_generic: "I had trouble, {honorific}.",
    error_network: "Network issue, {honorific}.",
    reminder_intro: "Reminder, {honorific}:",
    greeting: "Hello {honorific}.",
    thanks_reply: "You're welcome, {honorific}.",
    wake_ack: "Yes, {honorific}?",
  };
  return fillSlots(byCategory[category] ?? "", honorific);
}

interface SeedLine {
  category: VoiceCategory;
  lang: string;
  text: string;
  weight: number;
  tod: string | null;
}

const SEED_LINES: SeedLine[] = [
  // ── filler_wait (en) ──────────────────────────────────────────────────────
  { category: "filler_wait", lang: "en", text: "One moment, {honorific}.", weight: 1, tod: null },
  { category: "filler_wait", lang: "en", text: "Right away.", weight: 1, tod: null },
  { category: "filler_wait", lang: "en", text: "Hold on — checking.", weight: 1, tod: null },
  { category: "filler_wait", lang: "en", text: "Give me a sec, {honorific}.", weight: 1, tod: null },
  { category: "filler_wait", lang: "en", text: "On it.", weight: 1, tod: null },
  { category: "filler_wait", lang: "en", text: "Let me look.", weight: 1, tod: null },
  { category: "filler_wait", lang: "en", text: "Hang tight — working on it.", weight: 1, tod: null },
  { category: "filler_wait", lang: "en", text: "Just a moment, {honorific}.", weight: 1, tod: null },
  { category: "filler_wait", lang: "en", text: "One sec.", weight: 0.8, tod: null },
  { category: "filler_wait", lang: "en", text: "Bit late, {honorific} — one second.", weight: 1, tod: "late-night" },
  { category: "filler_wait", lang: "en", text: "Let me check that.", weight: 1, tod: null },

  // ── filler_wait (hi) ──────────────────────────────────────────────────────
  { category: "filler_wait", lang: "hi", text: "एक पल, {honorific}.", weight: 1, tod: null },
  { category: "filler_wait", lang: "hi", text: "ज़रा रुकिए, देख रहा हूँ.", weight: 1, tod: null },
  { category: "filler_wait", lang: "hi", text: "अभी करता हूँ.", weight: 1, tod: null },
  { category: "filler_wait", lang: "hi", text: "बस एक सेकंड.", weight: 1, tod: null },
  { category: "filler_wait", lang: "hi", text: "रुकिए, चेक कर रहा हूँ.", weight: 1, tod: null },
  { category: "filler_wait", lang: "hi", text: "एक मिनट, {honorific}.", weight: 0.9, tod: null },
  { category: "filler_wait", lang: "hi", text: "अभी देखता हूँ.", weight: 1, tod: null },
  { category: "filler_wait", lang: "hi", text: "थोड़ा रुकिए — कर रहा हूँ.", weight: 1, tod: null },
  { category: "filler_wait", lang: "hi", text: "रात के इस समय, {honorific} — बस एक पल.", weight: 1, tod: "late-night" },

  // ── filler_wait (mr) ──────────────────────────────────────────────────────
  { category: "filler_wait", lang: "mr", text: "एक क्षण, {honorific}.", weight: 1, tod: null },
  { category: "filler_wait", lang: "mr", text: "थांबा — बघतो.", weight: 1, tod: null },
  { category: "filler_wait", lang: "mr", text: "लागलोच.", weight: 1, tod: null },
  { category: "filler_wait", lang: "mr", text: "एक सेकंद.", weight: 1, tod: null },
  { category: "filler_wait", lang: "mr", text: "थांबा, तपासतो.", weight: 1, tod: null },
  { category: "filler_wait", lang: "mr", text: "रात्रीच्या वेळी, {honorific} — एक क्षण.", weight: 1, tod: "late-night" },

  // ── ack_quick (en) ─────────────────────────────────────────────────────────
  { category: "ack_quick", lang: "en", text: "Got it, {honorific}.", weight: 1, tod: null },
  { category: "ack_quick", lang: "en", text: "Sure thing.", weight: 1, tod: null },
  { category: "ack_quick", lang: "en", text: "On it, {honorific}.", weight: 1, tod: null },
  { category: "ack_quick", lang: "en", text: "You got it.", weight: 0.8, tod: null },
  { category: "ack_quick", lang: "en", text: "Absolutely.", weight: 1, tod: null },
  { category: "ack_quick", lang: "en", text: "Right away.", weight: 1, tod: null },
  { category: "ack_quick", lang: "en", text: "No problem.", weight: 1, tod: null },
  { category: "ack_quick", lang: "en", text: "Consider it done.", weight: 1, tod: null },
  { category: "ack_quick", lang: "en", text: "Will do.", weight: 1, tod: null },
  { category: "ack_quick", lang: "en", text: "Coming right up.", weight: 0.9, tod: null },

  // ── ack_quick (hi) ─────────────────────────────────────────────────────────
  { category: "ack_quick", lang: "hi", text: "समझ गया {honorific}.", weight: 1, tod: null },
  { category: "ack_quick", lang: "hi", text: "ठीक है, करता हूँ.", weight: 1, tod: null },
  { category: "ack_quick", lang: "hi", text: "ज़रूर.", weight: 1, tod: null },
  { category: "ack_quick", lang: "hi", text: "बिल्कुल {honorific}.", weight: 1, tod: null },
  { category: "ack_quick", lang: "hi", text: "अभी करता हूँ.", weight: 1, tod: null },
  { category: "ack_quick", lang: "hi", text: "कोई बात नहीं.", weight: 0.9, tod: null },
  { category: "ack_quick", lang: "hi", text: "हाँ {honorific}, करूँगा.", weight: 1, tod: null },
  { category: "ack_quick", lang: "hi", text: "फ़िकर मत करो.", weight: 0.8, tod: null },

  // ── ack_quick (mr) ─────────────────────────────────────────────────────────
  { category: "ack_quick", lang: "mr", text: "कळलं {honorific}.", weight: 1, tod: null },
  { category: "ack_quick", lang: "mr", text: "ठीक आहे, करतो.", weight: 1, tod: null },
  { category: "ack_quick", lang: "mr", text: "नक्की.", weight: 1, tod: null },
  { category: "ack_quick", lang: "mr", text: "अत्ताच करतो.", weight: 1, tod: null },
  { category: "ack_quick", lang: "mr", text: "काळजी करू नका.", weight: 0.8, tod: null },

  // ── ack_multistep (en) ─────────────────────────────────────────────────────
  { category: "ack_multistep", lang: "en", text: "Let me work through this, {honorific}.", weight: 1, tod: null },
  { category: "ack_multistep", lang: "en", text: "This needs a few steps — give me a minute.", weight: 1, tod: null },
  { category: "ack_multistep", lang: "en", text: "Alright, let me sort this out.", weight: 1, tod: null },
  { category: "ack_multistep", lang: "en", text: "On it, {honorific} — this'll take a moment.", weight: 1, tod: null },
  { category: "ack_multistep", lang: "en", text: "I'll work through this step by step.", weight: 1, tod: null },
  { category: "ack_multistep", lang: "en", text: "Let me handle that — might be a few steps.", weight: 1, tod: null },
  { category: "ack_multistep", lang: "en", text: "Give me a bit, {honorific} — working through it.", weight: 1, tod: null },
  { category: "ack_multistep", lang: "en", text: "Okay, multi-step request — bear with me.", weight: 0.9, tod: null },
  { category: "ack_multistep", lang: "en", text: "Let me walk through that for you.", weight: 1, tod: null },
  { category: "ack_multistep", lang: "en", text: "Bit involved — let me get to it.", weight: 0.8, tod: null },

  // ── ack_multistep (hi) ─────────────────────────────────────────────────────
  { category: "ack_multistep", lang: "hi", text: "ज़रा रुकिए {honorific}, यह काम कर रहा हूँ.", weight: 1, tod: null },
  { category: "ack_multistep", lang: "hi", text: "थोड़ा समय लगेगा — करता हूँ.", weight: 1, tod: null },
  { category: "ack_multistep", lang: "hi", text: "अच्छा, इसे सुलझाता हूँ.", weight: 1, tod: null },
  { category: "ack_multistep", lang: "hi", text: "कई कदम हैं — बस एक मिनट.", weight: 1, tod: null },
  { category: "ack_multistep", lang: "hi", text: "{honorific}, इसमें थोड़ा वक़्त लगेगा.", weight: 1, tod: null },
  { category: "ack_multistep", lang: "hi", text: "हर कदम पर ध्यान दूँगा.", weight: 0.9, tod: null },
  { category: "ack_multistep", lang: "hi", text: "ठीक है, बहु-चरणीय काम — साथ दीजिए.", weight: 0.9, tod: null },

  // ── confirm_yes_ack (en) ───────────────────────────────────────────────────
  { category: "confirm_yes_ack", lang: "en", text: "Sure, {honorific}.", weight: 1, tod: null },
  { category: "confirm_yes_ack", lang: "en", text: "Absolutely.", weight: 1, tod: null },
  { category: "confirm_yes_ack", lang: "en", text: "On it.", weight: 1, tod: null },
  { category: "confirm_yes_ack", lang: "en", text: "You got it.", weight: 1, tod: null },
  { category: "confirm_yes_ack", lang: "en", text: "Yes, {honorific} — doing it now.", weight: 1, tod: null },
  { category: "confirm_yes_ack", lang: "en", text: "Right away.", weight: 1, tod: null },
  { category: "confirm_yes_ack", lang: "en", text: "Got it — proceeding.", weight: 1, tod: null },
  { category: "confirm_yes_ack", lang: "en", text: "Will do.", weight: 0.9, tod: null },
  { category: "confirm_yes_ack", lang: "en", text: "Consider it done, {honorific}.", weight: 1, tod: null },
  { category: "confirm_yes_ack", lang: "en", text: "Yes, executing now.", weight: 1, tod: null },

  // ── confirm_yes_ack (hi) ───────────────────────────────────────────────────
  { category: "confirm_yes_ack", lang: "hi", text: "ज़रूर {honorific}.", weight: 1, tod: null },
  { category: "confirm_yes_ack", lang: "hi", text: "बिल्कुल.", weight: 1, tod: null },
  { category: "confirm_yes_ack", lang: "hi", text: "हाँ {honorific} — अभी कर रहा हूँ.", weight: 1, tod: null },
  { category: "confirm_yes_ack", lang: "hi", text: "ठीक है, आगे बढ़ रहा हूँ.", weight: 1, tod: null },
  { category: "confirm_yes_ack", lang: "hi", text: "समझ गया — कर रहा हूँ.", weight: 1, tod: null },
  { category: "confirm_yes_ack", lang: "hi", text: "हाँ, अभी करता हूँ.", weight: 1, tod: null },
  { category: "confirm_yes_ack", lang: "hi", text: "जी {honorific}, तुरंत.", weight: 0.9, tod: null },

  // ── decline_ack (en) ───────────────────────────────────────────────────────
  { category: "decline_ack", lang: "en", text: "I'll take that as a no.", weight: 1, tod: null },
  { category: "decline_ack", lang: "en", text: "Okay, I won't do that.", weight: 1, tod: null },
  { category: "decline_ack", lang: "en", text: "Skipping that, {honorific}.", weight: 1, tod: null },
  { category: "decline_ack", lang: "en", text: "Alright, moving on.", weight: 1, tod: null },
  { category: "decline_ack", lang: "en", text: "Understood — I'll leave it.", weight: 1, tod: null },
  { category: "decline_ack", lang: "en", text: "Fair enough, dropping it.", weight: 0.9, tod: null },
  { category: "decline_ack", lang: "en", text: "Right, I'll skip that.", weight: 1, tod: null },
  { category: "decline_ack", lang: "en", text: "OK, I'll forget about it.", weight: 0.8, tod: null },

  // ── reask (en) ─────────────────────────────────────────────────────────────
  { category: "reask", lang: "en", text: "I didn't catch that, {honorific}.", weight: 1, tod: null },
  { category: "reask", lang: "en", text: "Sorry, could you say that again?", weight: 1, tod: null },
  { category: "reask", lang: "en", text: "I didn't quite get that.", weight: 1, tod: null },
  { category: "reask", lang: "en", text: "Could you repeat that, {honorific}?", weight: 1, tod: null },
  { category: "reask", lang: "en", text: "Sorry, one more time?", weight: 1, tod: null },
  { category: "reask", lang: "en", text: "I missed that — could you rephrase?", weight: 0.9, tod: null },
  { category: "reask", lang: "en", text: "Didn't quite catch that, {honorific}.", weight: 1, tod: null },
  { category: "reask", lang: "en", text: "Come again?", weight: 0.8, tod: null },
  { category: "reask", lang: "en", text: "Say again?", weight: 0.7, tod: null },

  // ── error_generic (en) ─────────────────────────────────────────────────────
  { category: "error_generic", lang: "en", text: "I had trouble with that, {honorific}.", weight: 1, tod: null },
  { category: "error_generic", lang: "en", text: "Something went wrong.", weight: 1, tod: null },
  { category: "error_generic", lang: "en", text: "That didn't work, {honorific}.", weight: 1, tod: null },
  { category: "error_generic", lang: "en", text: "I ran into an issue.", weight: 1, tod: null },
  { category: "error_generic", lang: "en", text: "Couldn't do that, {honorific}.", weight: 1, tod: null },
  { category: "error_generic", lang: "en", text: "That didn't go as planned.", weight: 0.9, tod: null },
  { category: "error_generic", lang: "en", text: "Hit a snag there.", weight: 0.9, tod: null },
  { category: "error_generic", lang: "en", text: "Failed on that one, {honorific}.", weight: 0.8, tod: null },
  { category: "error_generic", lang: "en", text: "I had trouble", weight: 1, tod: null },

  // ── error_network (en) ─────────────────────────────────────────────────────
  { category: "error_network", lang: "en", text: "Network issue, {honorific}.", weight: 1, tod: null },
  { category: "error_network", lang: "en", text: "Couldn't reach the server.", weight: 1, tod: null },
  { category: "error_network", lang: "en", text: "Connection problem.", weight: 1, tod: null },
  { category: "error_network", lang: "en", text: "Lost connection there, {honorific}.", weight: 1, tod: null },
  { category: "error_network", lang: "en", text: "Network's not responding.", weight: 1, tod: null },
  { category: "error_network", lang: "en", text: "Couldn't connect.", weight: 1, tod: null },
  { category: "error_network", lang: "en", text: "The network timed out.", weight: 0.9, tod: null },
  { category: "error_network", lang: "en", text: "I'm having network trouble, {honorific}.", weight: 1, tod: null },

  // ── reminder_intro (en) ────────────────────────────────────────────────────
  { category: "reminder_intro", lang: "en", text: "Reminder, {honorific}:", weight: 1, tod: null },
  { category: "reminder_intro", lang: "en", text: "Just a heads-up, {honorific}:", weight: 1, tod: null },
  { category: "reminder_intro", lang: "en", text: "Don't forget, {honorific}:", weight: 1, tod: null },
  { category: "reminder_intro", lang: "en", text: "Quick reminder:", weight: 1, tod: null },
  { category: "reminder_intro", lang: "en", text: "Hey {honorific}, a reminder:", weight: 0.9, tod: null },
  { category: "reminder_intro", lang: "en", text: "This is your reminder, {honorific}:", weight: 1, tod: null },
  { category: "reminder_intro", lang: "en", text: "Reminding you that", weight: 1, tod: null },
  { category: "reminder_intro", lang: "en", text: "A quick nudge, {honorific}:", weight: 0.8, tod: null },
  { category: "reminder_intro", lang: "en", text: "By the way, {honorific}:", weight: 0.7, tod: null },

  // ── greeting (en) ──────────────────────────────────────────────────────────
  { category: "greeting", lang: "en", text: "Good morning, {honorific}!", weight: 1, tod: "morning" },
  { category: "greeting", lang: "en", text: "Hello {honorific}, how can I help?", weight: 1, tod: null },
  { category: "greeting", lang: "en", text: "Hey {honorific}, what can I do for you?", weight: 1, tod: null },
  { category: "greeting", lang: "en", text: "Good to see you, {honorific}!", weight: 1, tod: null },
  { category: "greeting", lang: "en", text: "Good afternoon, {honorific}.", weight: 1, tod: "evening" },
  { category: "greeting", lang: "en", text: "Welcome back, {honorific}.", weight: 1, tod: null },
  { category: "greeting", lang: "en", text: "How's it going, {honorific}?", weight: 1, tod: null },
  { category: "greeting", lang: "en", text: "Hello again, {honorific}.", weight: 0.9, tod: null },
  { category: "greeting", lang: "en", text: "Good evening, {honorific}.", weight: 1, tod: "late-night" },

  // ── greeting (hi) ──────────────────────────────────────────────────────────
  { category: "greeting", lang: "hi", text: "नमस्ते {honorific}! कैसे हैं आप?", weight: 1, tod: null },
  { category: "greeting", lang: "hi", text: "नमस्कार {honorific}!", weight: 1, tod: null },
  { category: "greeting", lang: "hi", text: "सुप्रभात {honorific}!", weight: 1, tod: "morning" },
  { category: "greeting", lang: "hi", text: "हैलो {honorific}! क्या कर सकता हूँ आपके लिए?", weight: 1, tod: null },
  { category: "greeting", lang: "hi", text: "फिर मिले {honorific}!", weight: 0.9, tod: null },
  { category: "greeting", lang: "hi", text: "कैसे हैं {honorific}?", weight: 1, tod: null },
  { category: "greeting", lang: "hi", text: "शुभ संध्या {honorific}!", weight: 1, tod: "evening" },
  { category: "greeting", lang: "hi", text: "आइए {honorific}, क्या कर सकता हूँ?", weight: 1, tod: null },

  // ── greeting (mr) ──────────────────────────────────────────────────────────
  { category: "greeting", lang: "mr", text: "नमस्कार {honorific}! कसं आहात?", weight: 1, tod: null },
  { category: "greeting", lang: "mr", text: "नमस्ते {honorific}!", weight: 1, tod: null },
  { category: "greeting", lang: "mr", text: "सुप्रभात {honorific}!", weight: 1, tod: "morning" },
  { category: "greeting", lang: "mr", text: "परत भेटलो {honorific}!", weight: 0.9, tod: null },
  { category: "greeting", lang: "mr", text: "कसं काय {honorific}?", weight: 1, tod: null },
  { category: "greeting", lang: "mr", text: "शुभ संध्या {honorific}!", weight: 1, tod: "evening" },
  { category: "greeting", lang: "mr", text: "ये आपलं स्वागत आहे {honorific}!", weight: 1, tod: null },

  // ── thanks_reply (en) ──────────────────────────────────────────────────────
  { category: "thanks_reply", lang: "en", text: "You're welcome, {honorific}!", weight: 1, tod: null },
  { category: "thanks_reply", lang: "en", text: "My pleasure, {honorific}!", weight: 1, tod: null },
  { category: "thanks_reply", lang: "en", text: "Anytime, {honorific}!", weight: 1, tod: null },
  { category: "thanks_reply", lang: "en", text: "Happy to help, {honorific}!", weight: 1, tod: null },
  { category: "thanks_reply", lang: "en", text: "Glad I could help.", weight: 1, tod: null },
  { category: "thanks_reply", lang: "en", text: "That's what I'm here for!", weight: 0.9, tod: null },
  { category: "thanks_reply", lang: "en", text: "No problem at all.", weight: 1, tod: null },
  { category: "thanks_reply", lang: "en", text: "Don't mention it, {honorific}.", weight: 0.8, tod: null },
  { category: "thanks_reply", lang: "en", text: "Of course!", weight: 1, tod: null },
  { category: "thanks_reply", lang: "en", text: "Always happy to assist.", weight: 1, tod: null },

  // ── thanks_reply (hi) ──────────────────────────────────────────────────────
  { category: "thanks_reply", lang: "hi", text: "आपका स्वागत है {honorific}!", weight: 1, tod: null },
  { category: "thanks_reply", lang: "hi", text: "मेरी ख़ुशी है {honorific}!", weight: 1, tod: null },
  { category: "thanks_reply", lang: "hi", text: "कोई बात नहीं!", weight: 1, tod: null },
  { category: "thanks_reply", lang: "hi", text: "ख़ुशी से मदद की.", weight: 1, tod: null },
  { category: "thanks_reply", lang: "hi", text: "हमेशा ख़ुशी से मदद करूँगा.", weight: 0.9, tod: null },
  { category: "thanks_reply", lang: "hi", text: "आपका स्वागत है!", weight: 1, tod: null },

  // ── thanks_reply (mr) ──────────────────────────────────────────────────────
  { category: "thanks_reply", lang: "mr", text: "तुमचं स्वागत आहे {honorific}!", weight: 1, tod: null },
  { category: "thanks_reply", lang: "mr", text: "माझं कर्तव्य आहे {honorific}!", weight: 1, tod: null },
  { category: "thanks_reply", lang: "mr", text: "काही हरकत नाही.", weight: 1, tod: null },
  { category: "thanks_reply", lang: "mr", text: "आनंदाने मदत केली.", weight: 1, tod: null },
  { category: "thanks_reply", lang: "mr", text: "नेहमी आनंदाने मदत करेन.", weight: 0.9, tod: null },

  // ── wake_ack (en) ──────────────────────────────────────────────────────────
  { category: "wake_ack", lang: "en", text: "Yes, {honorific}?", weight: 1, tod: null },
  { category: "wake_ack", lang: "en", text: "I'm here, {honorific}.", weight: 1, tod: null },
  { category: "wake_ack", lang: "en", text: "Listening, {honorific}.", weight: 1, tod: null },
  { category: "wake_ack", lang: "en", text: "Ready when you are.", weight: 1, tod: null },
  { category: "wake_ack", lang: "en", text: "Go ahead, {honorific}.", weight: 1, tod: null },
  { category: "wake_ack", lang: "en", text: "I'm listening.", weight: 1, tod: null },
  { category: "wake_ack", lang: "en", text: "At your service.", weight: 0.9, tod: null },
  { category: "wake_ack", lang: "en", text: "What can I do, {honorific}?", weight: 1, tod: null },
  { category: "wake_ack", lang: "en", text: "Morning, {honorific}.", weight: 0.8, tod: "morning" },

  // ── wake_ack (hi) ──────────────────────────────────────────────────────────
  { category: "wake_ack", lang: "hi", text: "हाँ {honorific}?", weight: 1, tod: null },
  { category: "wake_ack", lang: "hi", text: "मैं हूँ {honorific}.", weight: 1, tod: null },
  { category: "wake_ack", lang: "hi", text: "सुन रहा हूँ {honorific}.", weight: 1, tod: null },
  { category: "wake_ack", lang: "hi", text: "कहिए {honorific}.", weight: 1, tod: null },
  { category: "wake_ack", lang: "hi", text: "बोलिए {honorific}, सुन रहा हूँ.", weight: 1, tod: null },
  { category: "wake_ack", lang: "hi", text: "आपकी सेवा में.", weight: 0.9, tod: null },
  { category: "wake_ack", lang: "hi", text: "क्या कर सकता हूँ {honorific}?", weight: 1, tod: null },
];

export async function seedVoiceLines(): Promise<void> {
  await ensureVoiceLinesTable();

  for (const line of SEED_LINES) {
    const existing = await getLinesByCategory(line.category, line.lang);
    const alreadySeeded = existing.some(e => e.text === line.text);
    if (alreadySeeded) continue;

    await insertLine({
      id: crypto.randomUUID(),
      category: line.category,
      lang: line.lang,
      text: line.text,
      source: "seed",
      enabled: 1,
      weight: line.weight,
      lastUsedAt: null,
      useCount: 0,
      createdAt: Date.now(),
      tod: line.tod || null,
    });
  }
}
