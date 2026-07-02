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

const INTENT_TABLE: (CannedEntry & { intent: CannedIntent })[] = [
  // -- Greetings --
  { intent: "greeting",
    patterns: [
      /\b(good\s*)?morning\b/i,
      /\b(good\s*)?afternoon\b/i,
      /\b(good\s*)?evening\b/i,
      /\b(hi|hello|hey|heyy?)\b/i,
      /(?:^|\s)(नमस्ते|नमस्कार)/u,
      /(?:^|\s)(सुप्रभात|शुभ\s*प्रभात)/u,
    ],
    responses: {
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
    },
  },
  // -- Thanks --
  { intent: "thanks",
    patterns: [
      /\bthank\s*(you|s)?\b/i,
      /\bthanks\b/i,
      /(?:^|\s)धन्यवाद/u,
    ],
    responses: {
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
    },
  },
  // -- Acknowledgments (yes/okay/sure fillers) --
  { intent: "acknowledgment",
    patterns: [
      /\b(yes|yeah|yep|sure|okay|ok|alright|got\s*it|on\s*it)\b/i,
      /(?:^|\s)(हाँ|हां|ठीक\s*है|अच्छा)/u,
      /(?:^|\s)(होय|ठीक\s*आहे)/u,
    ],
    responses: {
      en: [
        "On it, {honorific}!",
        "Sure, {honorific}!",
        "Okay {honorific}, working on it.",
        "Got it, {honorific}!",
      ],
      hi: [
        "ठीक है {honorific}!",
        "हाँ {honorific}, कर रहा हूँ।",
      ],
      mr: [
        "ठीक आहे {honorific}!",
        "होय {honorific}, करतो. ",
      ],
    },
  },
];

export function matchCannedResponse(
  text: string,
  honorific: string,
): { response: string; intent: CannedIntent } | null {
  const lang = detectLanguage(text);
  for (const entry of INTENT_TABLE) {
    for (const pattern of entry.patterns) {
      if (pattern.test(text)) {
        const pool = entry.responses[lang] ?? entry.responses["en"];
        const reply = pool[Math.floor(Math.random() * pool.length)];
        return { response: reply.replace(/{honorific}/g, honorific), intent: entry.intent };
      }
    }
  }
  return null;
}
