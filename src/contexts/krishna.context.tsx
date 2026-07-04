import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { useApp } from "@/contexts";
import { useMcpTools, useDevicePresence } from "@/hooks";
import { fetchAIResponse } from "@/lib/repo-bound";
import { getRepo } from "@/lib/repo-selector";
import { parseActions, executeAction, resolveActionForConfirm, decideActionResponse, detectPhantomSave } from "@/lib/actions";
import { executePlan, resolvePlaceholders } from "@/lib/executor";
import { getAllTools } from "@/lib/tools";
import { selectTools } from "@krishna/core/tool-selector";
import { getTTS, getElevenLabsTTS, getPiperTTS, type TTSProvider } from "@/lib/tts";
import { setSpokenUrlNames } from "@/lib/speech-sanitize";
import { APP_ALIASES } from "@/config/app-aliases";
import { safeLocalStorage } from "@/lib";
import { secureStorage } from "@/lib/secure-storage";
import { STORAGE_KEYS, DEFAULT_SYSTEM_PROMPT } from "@/config";
import { setKrishnaSpeaking } from "@/lib/krishna-mutex";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { parseYesNo } from "@/lib/parse-yes-no";
import { saveAndConfirm } from "@/lib/resolver";
import { getAllSkills, getSkillByName, createSkill, updateSkillUseCount } from "@/lib/repo-bound";
import { getAllMemories, createMemory } from "@/lib/repo-bound";
import { parseRememberCommand } from "@/lib/memory";
import { detectWakeWord } from "@/lib/wake-word";
import { parseReminderCommand } from "@/lib/reminders";
import { createReminder, getDueReminders, updateReminder, cancelReminder } from "@/lib/repo-bound";
import { createConversation, appendMessages, generateConversationTitle, getMostRecentConversation, deleteConversation } from "@/lib/repo-bound";
import { isLookCommand, isUndoCommand, isJobExtractionCommand, isJobStatusCommand } from "@/lib/perception";
import { triggerJobExtractionWorkflow, getJobExtractionStatus } from "@/lib/integrations/github-workflow";
import { createAuditEntry, getLastReversible, logCommand, insertPendingCommand, updateCommandOutcome, updateCommandTiming, logSpeech } from "@/lib/database";
import type { CommandOutcome, FailureReason, SpeechSource } from "@/lib/database";
import { setConfirmAction, setVerbatimConfirm } from "@krishna/core/tools/mcp-bridge";
import type { AssistantStatus, StepAction } from "@/types/assistant";
import type { Skill } from "@/types/skill";
import type { Message, AttachedFile } from "@/types";
import type { VoiceVerifyResult } from "@/lib/voice-client";
import { MAX_FILES } from "@/config";
import { TurnTiming } from "@/lib/turn-timing";
import { getResponseSettings } from "@krishna/core/settings";
import { matchCannedResponse } from "@/lib/canned-responses";

export interface ConversationTurn {
  id: string;
  userText: string;
  assistantText: string;
  timestamp: number;
}

interface KrishnaContextType {
  enabled: boolean;
  setKrishnaEnabled: (v: boolean) => void;
  status: AssistantStatus;
  lastSpoken: string;
  processCommand: (transcription: string, opts?: { skipWakeWord?: boolean; voiceVerifyResult?: VoiceVerifyResult }) => Promise<void>;
  stopSpeaking: () => void;
  pendingCommand: string | null;
  lastError: string | null;
  clearLastError: () => void;
  voice: string;
  setVoice: (name: string) => void;
  rate: number;
  setRate: (v: number) => void;
  llmFallbackEnabled: boolean;
  setLlmFallbackEnabled: (v: boolean) => void;
  ttsProvider: "browser" | "elevenlabs" | "piper";
  setTtsProvider: (p: "browser" | "elevenlabs" | "piper") => void;
  elApiKey: string;
  setElApiKey: (k: string) => void;
  elVoiceId: string;
  setElVoiceId: (id: string) => void;
  elVoiceName: string;
  setElVoiceName: (name: string) => void;
  elModelId: string;
  setElModelId: (id: string) => void;
  conversationHistory: ConversationTurn[];
  setConversationHistory: (turns: ConversationTurn[]) => void;
  clearActiveConversation: () => void;
  wakeWordEnabled: boolean;
  setWakeWordEnabled: (v: boolean) => void;
  wakeWord: string;
  setWakeWord: (w: string) => void;
  attachedFiles: AttachedFile[];
  addFile: (file: File) => Promise<void>;
  removeFile: (fileId: string) => void;
  clearFiles: () => void;
  captureScreenshot: () => Promise<void>;
  isScreenshotLoading: boolean;
}

const KrishnaContext = createContext<KrishnaContextType | undefined>(undefined);

export const BASE_SYSTEM_PROMPT = [
  'You are Krishna, an AI desktop assistant. You help users by answering questions and performing actions on their computer.',
  '',
  'CRITICAL - Action Protocol:',
  '- If the user asks you to open an app, website, or file, respond naturally AND append a JSON action block:',
  '```action',
  '{"action":"open","target":"<app_name_or_url>"}',
  '```',
  '- The JSON block will NOT be read aloud -- it is only used to trigger the action.',
  '- Speak naturally in the spoken part. Keep responses concise.',
  '- For URLs, just use the URL as target (e.g., "https://youtube.com").',
  '- Always output the action block for any app the user asks to open -- even if you don\'t recognize it. The system will auto-resolve unknown apps.',
  '',
  'WHAT YOU CAN AND CANNOT DO (be honest, never sandbox-deny):',
  '- You CAN: open apps, websites, and files; type text and press keys into a window; remember facts. NEVER say "I cannot access your computer" or "I don\'t have the ability to access your screen/taskbar" -- you act on this computer directly.',
  '- You CANNOT: see the screen, read the taskbar, inspect Task Manager, or list running processes -- you have no screen-reading or inspection tools. If asked to look at / check / diagnose something already on screen, say plainly that you cannot see it, then offer the closest action you CAN take.',
  '- If the user says an app "won\'t open", "isn\'t launching", or "isn\'t working" (e.g. "why isn\'t VS Code opening"), do NOT reply with a generic troubleshooting checklist. Offer to open it yourself and append the open action (e.g. open "code"). You may also offer to open Task Manager by opening "taskmgr" so they can look themselves.',
  '',
  'MEMORY & REMEMBER:',
  '- You have persistent, on-device long-term memory. You CAN remember facts across sessions.',
  '- When the user asks you to remember / save / note something (a URL, name, preference, ID), append a memory action block:',
  '```action',
  '{"action":"remember","key":"<short label or null>","value":"<the exact fact to store>"}',
  '```',
  '- The JSON "key" is a short label (e.g. "jobs url", "my name"), or null if no label given.',
  '- The JSON "value" is the exact fact to store (e.g. a full URL, a name, a preference).',
  '- The block will NOT be read aloud -- it is only used to trigger the save.',
  '- NEVER claim you cannot remember or that memory only lasts this session. The save is confirmed with the user before storing.',
  '- Already-known facts are listed under "Things I know about the user" in each prompt — do not re-save them.',
  '- Example — user says "remember my home address is 123 Main St" → emit the action block, and in the SPOKEN part say ONLY that you will confirm — e.g. "Let me confirm that with you, {honorific}." — because Krishna asks the user to confirm before anything is actually stored:',
  '```action',
  '{"action":"remember","key":"home address","value":"123 Main St"}',
  '```',
  'Let me confirm that with you, {honorific}.',
  '- CRITICAL — never announce an action as already done or in progress. Do NOT say "saved", "remembered", "noted", "I\'ll save", "I\'ll remember", or "Saving that now": a remember action triggers a confirmation you cannot foresee, so ANY past- or present-tense save claim is a lie. Say only that you will confirm, or say nothing and let Krishna\'s confirmation prompt speak.',
  '- This applies to EVERY action, not just saving: NEVER narrate an action you are not emitting in the same reply. If you say "Now let me check the travel time", the travel_time action block MUST be in that same reply — otherwise you are describing something that will never happen.',
  '',
  'TRAVEL TIME:',
  '- "how long to work?" → Check the user\'s confirmed memories for a known "work" / "work address". If known, emit:',
  '```action',
  '{"action":"travel_time","from":"home","to":"work","mode":"car"}',
  '```',
  '- `from` defaults to "home" when omitted; `mode` defaults to "car".',
  '- "how long to the airport by bike?" → mode "two_wheeler". "by train" → mode "transit".',
  '- If the place address is NOT known from memories, ask ONCE: "I don\'t have your {place} address — tell me and I\'ll remember it." Then use the existing remember action to store it. Do NOT retry the travel_time call with an unknown place.',
  '',
  'GMAIL:',
  '- You can search, read, list labels, and send emails through Gmail. All Gmail actions are client-side (no brain required).',
  '- "do I have any mail from HDFC?" →',
  '```action',
  '{"action":"gmail_search","query":"from:hdfc","maxResults":5}',
  '```',
  '- "read the latest email" → use the message id from a prior search result:',
  '```action',
  '{"action":"gmail_read","id":"<message_id>"}',
  '```',
  '- "send an email to vikram@example.com saying Hello from Krishna" with subject "Greetings":',
  '```action',
  '{"action":"gmail_send","to":"vikram@example.com","subject":"Greetings","body":"Hello from Krishna"}',
  '```',
  '- "list my labels" →',
  '```action',
  '{"action":"gmail_list_labels"}',
  '```',
  '- gmail_send requires explicit user confirmation before sending (recipient + subject are spoken back).',
  '- Read tools (search, read, list labels) are safe and execute without confirmation.',
  '- Results are spoken concisely: search shows count + newest subject, read shows sender/subject/gist.',
  '',
  'MULTI-STEP TASK PLANNING (Phase 4):',
  'For complex requests like "play this song on YouTube" or "type opencode in command prompt", you can output a multi-step plan instead of a single action.',
  'Use the ```plan JSON block:',
  '',
  '```plan',
  '{',
  '  "say": "I\'ll search YouTube for the song and play it.",',
  '  "needsConfirmation": true,',
  '  "plan": [',
  '    { "tool": "youtube_search", "args": { "query": "song name" }, "out": "url" },',
  '    { "tool": "open_target", "args": { "target": "${url}" } }',
  '  ]',
  '}',
  '```',
  '',
  'Example for typing into a terminal:',
  '```plan',
  '{',
  '  "say": "I will open command prompt and type opencode.",',
  '  "needsConfirmation": true,',
  '  "plan": [',
  '    { "tool": "open_target", "args": { "target": "cmd" } },',
  '    { "tool": "computer_type", "args": { "text": "opencode" } },',
  '    { "tool": "computer_key", "args": { "keys": "enter" } }',
  '  ]',
  '}',
  '```',
  '',
  'SPOKEN CONVERSATION ETIQUETTE:',
  '- Address the user with the honorific "{honorific}" (e.g. "Good morning, {honorific}", "On it, {honorific}").',
  '- Reply in the same language the user used. If they greet in Hindi, reply in Hindi. If they ask in English, reply in English.',
  '- Spoken reply: at most 2 sentences. NEVER use markdown, headings, bullet lists, or numbered lists — this is read aloud. If the question is broad, give a one-sentence answer and offer to elaborate.',
  '- ACKNOWLEDGE-THEN-ACT: when the user\'s request requires actions or multiple steps, first speak a one-line acknowledgment with an honest timeline (e.g. "On it, {honorific} — this needs a couple of steps, give me a minute"), then emit the action/plan block. Do not start speaking the action result before acknowledging.',
  '- If something will be slow, say so honestly before proceeding.',
].join("\n");

const SYSTEM_PROMPT_RULES = [
  '',
  'Available tools:',
  '',
  'Rules:',
  '1. PREFER deep-links (Tier 1) over multi-step plans when possible. A simple open_target with a composed URL is most reliable.',
  '2. Use multi-step plans only when you need intermediate data (e.g., a search result ID).',
  '3. Always set "needsConfirmation": true for multi-step plans.',
  '4. Use ${variable} placeholders to pass outputs between steps.',
  '5. For "play X on YouTube", prefer composing the URL directly: open_target with "https://www.youtube.com/results?search_query=<query>"',
  '6. To type into an already-open window, use a plan: open_target first (if the app is not open), then computer_type with the text, then computer_key with enter. These always require user confirmation.',
  '7. "Open VS Code", "open code", "open code in a terminal", "launch VS Code" → ALL mean the same thing: ONE open_target action with target "code". Do NOT open cmd first.',
  '8. "Open VS Code at path X" or "open my repo in VS Code" → open_target with target "code" and args path (opens VS Code directly at that folder).',
  '9. "Open a terminal" or "open command prompt" → open_target with target "cmd". Then use computer_type and computer_key to type commands into it.',
  '10. Only use computer_* tools when the user explicitly asks you to type/click/control something. Never use them to fill passwords or payment fields.',
].join("\n");

function buildToolsSection(query?: string): string {
  const allTools = getAllTools();
  const selected = query ? selectTools(query, allTools, 10) : allTools;
  return selected.map((t) => "- " + t.name + ": " + t.description).join("\n");
}

// ---- Skill pattern helpers ----

function derivePattern(input: string, steps: StepAction[]): {
  pattern: string;
  params: string;
  planTemplate: string;
} {
  const rawValues: string[] = [];
  for (const step of steps) {
    for (const value of Object.values(step.args)) {
      if (typeof value === 'string' && value.length > 0 && !value.startsWith('${') && !rawValues.includes(value)) {
        rawValues.push(value);
      }
    }
  }

  rawValues.sort((a, b) => b.length - a.length);
  const values = rawValues.filter(v => input.toLowerCase().includes(v.toLowerCase()));

  if (values.length === 0) {
    return { pattern: input, params: '[]', planTemplate: JSON.stringify(steps) };
  }

  let pattern = input;
  const templateSteps: StepAction[] = JSON.parse(JSON.stringify(steps));
  const paramNames: string[] = [];

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    const paramName = 'param' + i;
    const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const valueRegex = new RegExp(escapedValue, 'gi');
    if (valueRegex.test(pattern)) {
      pattern = pattern.replace(valueRegex, '{' + paramName + '}');
      paramNames.push(paramName);
      for (const step of templateSteps) {
        for (const [key, val] of Object.entries(step.args)) {
          if (typeof val === 'string' && val.toLowerCase() === value.toLowerCase()) {
            step.args[key] = '${' + paramName + '}';
          }
        }
      }
    }
  }

  if (paramNames.length === 0) {
    return { pattern: input, params: '[]', planTemplate: JSON.stringify(steps) };
  }

  return { pattern, params: JSON.stringify(paramNames), planTemplate: JSON.stringify(templateSteps) };
}

function matchSkillPattern(command: string, skill: Skill): Record<string, string> | null {
  const paramNames: string[] = JSON.parse(skill.params);

  if (paramNames.length === 0) {
    return command.toLowerCase() === skill.triggerExamples.toLowerCase() ? {} : null;
  }

  const pattern = skill.triggerExamples;
  let regexStr = '';
  let lastIndex = 0;
  const foundParams: string[] = [];
  const paramRegex = /\{(\w+)\}/g;
  let match;

  while ((match = paramRegex.exec(pattern)) !== null) {
    if (paramNames.includes(match[1])) {
      regexStr += pattern.slice(lastIndex, match.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regexStr += '(.+)';
      foundParams.push(match[1]);
      lastIndex = match.index + match[0].length;
    }
  }
  regexStr += pattern.slice(lastIndex).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  try {
    const regex = new RegExp('^' + regexStr + '$', 'i');
    const regexMatch = command.match(regex);
    if (!regexMatch) return null;

    const extracted: Record<string, string> = {};
    for (let i = 0; i < foundParams.length; i++) {
      extracted[foundParams[i]] = regexMatch[i + 1];
    }
    return extracted;
  } catch {
    return null;
  }
}

export function KrishnaProvider({ children }: { children: ReactNode }) {
  const { selectedAIProvider, allAiProviders, systemPrompt: selectedSystemPrompt } = useApp();
  const ttsRef = useRef<TTSProvider>(getTTS());

  useMcpTools();
  useDevicePresence();

  const [enabled, setEnabled] = useState<boolean>(true);
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [lastSpoken, setLastSpoken] = useState<string>("");
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const clearLastError = useCallback(() => setLastError(null), []);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const pendingUserTextRef = useRef<string>("");
  const currentCaptureIdRef = useRef<string | null>(null);
  const fillerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fillerSpokenRef = useRef(false);
  const fillerPromiseRef = useRef<Promise<void> | null>(null);
  const [voice, setVoiceState] = useState<string>(() => {
    return safeLocalStorage.getItem(STORAGE_KEYS.KRISHNA_VOICE) || "";
  });
  const [rate, setRateState] = useState<number>(() => {
    const stored = safeLocalStorage.getItem(STORAGE_KEYS.KRISHNA_RATE);
    return stored ? parseFloat(stored) : 1.0;
  });

  // ElevenLabs TTS settings
  const [ttsProvider, setTtsProviderState] = useState<"browser" | "elevenlabs" | "piper">(() => {
    return (safeLocalStorage.getItem(STORAGE_KEYS.KRISHNA_TTS_PROVIDER) as "browser" | "elevenlabs" | "piper") || "browser";
  });
  const [elApiKey, setElApiKeyState] = useState<string>("");
  const elApiKeyLoadedRef = useRef(false);
  useEffect(() => {
    if (elApiKeyLoadedRef.current) return;
    elApiKeyLoadedRef.current = true;
    secureStorage.get(STORAGE_KEYS.KRISHNA_EL_API_KEY).then((val) => {
      if (val) setElApiKeyState(val);
    });
  }, []);
  const [elVoiceId, setElVoiceIdState] = useState<string>(() => {
    return safeLocalStorage.getItem(STORAGE_KEYS.KRISHNA_EL_VOICE_ID) || "21m00Tcm4TlvDq8ikWAM";
  });
  const [elVoiceName, setElVoiceNameState] = useState<string>(() => {
    return safeLocalStorage.getItem("krishna_el_voice_name") || "Rachel";
  });
  const [elModelId, setElModelIdState] = useState<string>(() => {
    return safeLocalStorage.getItem(STORAGE_KEYS.KRISHNA_EL_MODEL_ID) || "eleven_turbo_v2_5";
  });

  const [wakeWordEnabled, setWakeWordEnabledState] = useState<boolean>(() => {
    return safeLocalStorage.getItem(STORAGE_KEYS.KRISHNA_WAKE_WORD_ENABLED) !== "false";
  });
  const [wakeWord, setWakeWordState] = useState<string>(() => {
    return safeLocalStorage.getItem(STORAGE_KEYS.KRISHNA_WAKE_WORD) || "hey krishna";
  });

  const elTtsRef = useRef(getElevenLabsTTS());

  // Swap ttsRef when provider or EL config changes
  useEffect(() => {
    if (ttsProvider === "elevenlabs") {
      elTtsRef.current.configure({ apiKey: elApiKey, voiceId: elVoiceId, modelId: elModelId });
      ttsRef.current = elTtsRef.current;
    } else if (ttsProvider === "piper") {
      ttsRef.current = getPiperTTS();
    } else {
      ttsRef.current = getTTS();
    }
  }, [ttsProvider, elApiKey, elVoiceId, elModelId]);

  const setTtsProvider = useCallback((p: "browser" | "elevenlabs" | "piper") => {
    setTtsProviderState(p);
    safeLocalStorage.setItem(STORAGE_KEYS.KRISHNA_TTS_PROVIDER, p);
  }, []);
  const setElApiKey = useCallback((k: string) => {
    setElApiKeyState(k);
    secureStorage.set(STORAGE_KEYS.KRISHNA_EL_API_KEY, k);
  }, []);
  const setElVoiceId = useCallback((id: string) => {
    setElVoiceIdState(id);
    safeLocalStorage.setItem(STORAGE_KEYS.KRISHNA_EL_VOICE_ID, id);
  }, []);
  const setElVoiceName = useCallback((name: string) => {
    setElVoiceNameState(name);
    safeLocalStorage.setItem("krishna_el_voice_name", name);
  }, []);
  const setElModelId = useCallback((id: string) => {
    setElModelIdState(id);
    safeLocalStorage.setItem(STORAGE_KEYS.KRISHNA_EL_MODEL_ID, id);
  }, []);

  const setWakeWordEnabled = useCallback((v: boolean) => {
    setWakeWordEnabledState(v);
    safeLocalStorage.setItem(STORAGE_KEYS.KRISHNA_WAKE_WORD_ENABLED, String(v));
  }, []);
  const setWakeWord = useCallback((w: string) => {
    setWakeWordState(w);
    safeLocalStorage.setItem(STORAGE_KEYS.KRISHNA_WAKE_WORD, w);
  }, []);

  const clearActiveConversation = useCallback(async () => {
    if (activeConversationRef.current) {
      try {
        await deleteConversation(activeConversationRef.current);
      } catch (e) {
        console.error("Failed to delete active conversation:", e);
      }
      activeConversationRef.current = null;
      lastTurnTimeRef.current = 0;
    }
    setConversationHistory([]);
  }, []);

  const abortRef = useRef<AbortController | null>(null);
  const planAbortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<Message[]>([]);
  const activeConversationRef = useRef<string | null>(null);
  const lastTurnTimeRef = useRef<number>(0);
  const IDLE_THRESHOLD = 15 * 60 * 1000; // 15 minutes
  const attachedFilesRef = useRef<AttachedFile[]>([]);

  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isScreenshotLoading, setIsScreenshotLoading] = useState(false);

  // Sync attached files ref
  useEffect(() => {
    attachedFilesRef.current = attachedFiles;
  }, [attachedFiles]);

  const logOutcome = (
    _transcript: string,
    outcome: CommandOutcome,
    failureReason?: FailureReason,
    detail?: string,
    response?: string,
    _source: "voice" | "text" | "mobile" = "voice",
    captureId?: string,
    timing?: string,
  ) => {
    const id = captureId ?? currentCaptureIdRef.current ?? crypto.randomUUID();
    updateCommandOutcome({ id, outcome, failureReason, detail, response, timing }).catch((err) =>
      console.error("Failed to update command outcome:", err)
    );
    emit("command-log-updated").catch(() => {});
  };

  const recordTurn = async (userText: string, assistantText: string) => {
    if (!userText && !assistantText) return;
    const now = Date.now();
    const turn: ConversationTurn = {
      id: crypto.randomUUID(),
      userText,
      assistantText,
      timestamp: now,
    };
    setConversationHistory(prev => [turn, ...prev].slice(0, 100));
    try {
      const idle = now - lastTurnTimeRef.current;
      if (!activeConversationRef.current || idle > IDLE_THRESHOLD) {
        const conv = await createConversation({
          id: crypto.randomUUID(),
          title: generateConversationTitle(userText),
          createdAt: now,
          updatedAt: now,
          messages: [],
        });
        activeConversationRef.current = conv.id;
      }
      await appendMessages(activeConversationRef.current, [
        { role: "user", content: userText, timestamp: now },
        { role: "assistant", content: assistantText, timestamp: now + 1 },
      ]);
      lastTurnTimeRef.current = now;
    } catch (e) {
      // Stale/missing conversation — recreate and retry once
      const errMsg = e instanceof Error ? e.message : String(e);
      if (errMsg.includes("FOREIGN KEY") || errMsg.includes("does not exist")) {
        try {
          const conv = await createConversation({
            id: crypto.randomUUID(),
            title: generateConversationTitle(userText),
            createdAt: now,
            updatedAt: now,
            messages: [],
          });
          activeConversationRef.current = conv.id;
          await appendMessages(activeConversationRef.current, [
            { role: "user", content: userText, timestamp: now },
            { role: "assistant", content: assistantText, timestamp: now + 1 },
          ]);
          lastTurnTimeRef.current = now;
          return;
        } catch {
          // fall through to outer catch
        }
      }
      console.error("Failed to persist turn to SQLite:", e);
    }
  };

  // T4-F7: single choke point for every spoken utterance. Persists to speech_log
  // (fire-and-forget) alongside the actual TTS call, so success AND failure/timeout/decline
  // lines are all visible on the dashboard — not just the ones that already had a
  // command_log row. Returns the same promise ttsRef.current.speak() would, so existing
  // `await speakLogged(...)` / `.finally()` call sites behave identically to before.
  const speakLogged = (text: string, source: SpeechSource, relatedCommandId?: string | null) => {
    const id = crypto.randomUUID();
    logSpeech({
      id,
      text,
      source,
      relatedCommandId: relatedCommandId ?? currentCaptureIdRef.current ?? null,
      createdAt: Date.now(),
    }).catch((err) => console.error("Failed to log speech:", err));
    return ttsRef.current.speak(text);
  };

  const addFile = useCallback(async (file: File) => {
    if (attachedFiles.length >= MAX_FILES) return;
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      bytes.forEach(b => { binary += String.fromCharCode(b); });
      const base64 = btoa(binary);
      const attachedFile: AttachedFile = {
        id: String(Date.now()),
        name: file.name,
        type: file.type,
        base64,
        size: file.size,
      };
      setAttachedFiles(prev => [...prev, attachedFile]);
    } catch (err) {
      console.error("Failed to attach file:", err);
    }
  }, [attachedFiles.length]);

  const removeFile = useCallback((fileId: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== fileId));
  }, []);

  const clearFiles = useCallback(() => {
    setAttachedFiles([]);
  }, []);

  const captureScreenshot = useCallback(async () => {
    setIsScreenshotLoading(true);
    try {
      const base64 = await invoke<string>("capture_to_base64");
      const attachedFile: AttachedFile = {
        id: String(Date.now()),
        name: "screenshot.png",
        type: "image/png",
        base64,
        size: 0,
      };
      setAttachedFiles(prev => [...prev, attachedFile]);
    } catch (err) {
      console.error("Failed to capture screenshot:", err);
    } finally {
      setIsScreenshotLoading(false);
    }
  }, []);

  // Initialize natural voice on first mount
  const voiceInitRef = useRef(false);
  useEffect(() => {
    if (voiceInitRef.current) return;
    const loadVoices = () => {
      // Android WebView has no Web Speech API — guard so this can't blank the app.
      const allVoices = window.speechSynthesis?.getVoices() ?? [];
      if (voice) {
        const saved = allVoices.find((v) => v.name === voice);
        if (saved) {
          ttsRef.current.setVoice(saved);
          voiceInitRef.current = true;
          return;
        }
      }
      const natural = allVoices.find(
        (v) => v.name.includes("Natural") && v.lang.startsWith("en") && v.name.includes("David")
      ) || allVoices.find(
        (v) => v.name.includes("Natural") && v.lang.startsWith("en")
      ) || allVoices.find(
        (v) => v.lang.startsWith("en") && v.name.includes("Microsoft")
      );
      if (natural) {
        ttsRef.current.setVoice(natural);
        voiceInitRef.current = true;
      }
    };
    loadVoices();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = loadVoices;
  }, [voice]);

  // Sync TTS rate when it changes
  useEffect(() => {
    ttsRef.current.setRate(rate);
  }, [rate]);

  // Hydrate conversation history from SQLite on mount
  useEffect(() => {
    (async () => {
      try {
        const recent = await getMostRecentConversation();
        if (recent && recent.messages.length > 0) {
          const turns: ConversationTurn[] = [];
          let currentTurn: ConversationTurn | null = null;
          for (const msg of recent.messages) {
            if (msg.role === "user") {
              currentTurn = { id: crypto.randomUUID(), userText: msg.content, assistantText: "", timestamp: msg.timestamp };
            } else if (msg.role === "assistant" && currentTurn) {
              currentTurn.assistantText = msg.content;
              turns.push(currentTurn);
              currentTurn = null;
            }
          }
          if (currentTurn) {
            // Orphaned user message — push anyway
            turns.push(currentTurn);
          }
          setConversationHistory(turns.reverse());
          activeConversationRef.current = recent.id;
          lastTurnTimeRef.current = recent.updatedAt;
        }
      } catch (e) {
        console.error("Failed to hydrate conversation history from SQLite:", e);
      }
    })();
  }, []);

  const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reminder scheduler — check every 30 seconds for due reminders
  useEffect(() => {
    schedulerRef.current = setInterval(async () => {
      try {
        const due = await getDueReminders();
        for (const reminder of due) {
          const speak = "Reminder: " + reminder.text;
          setLastSpoken(speak);
          setKrishnaSpeaking(true);
          try {
            await speakLogged(speak, "answer");
          } finally {
            setKrishnaSpeaking(false);
          }
          try {
            await createAuditEntry({
              id: String(Date.now()),
              actionType: "reminder",
              summary: "Reminder fired: " + reminder.text,
              result: "ok",
              reversible: 0,
              undoPayload: null,
              createdAt: Date.now(),
            });
          } catch { /* non-critical */ }
          if (reminder.recurrence === "daily") {
            const nextDue = reminder.dueAt + 86400000;
            await updateReminder({ ...reminder, dueAt: nextDue });
          } else if (reminder.recurrence === "weekly") {
            const nextDue = reminder.dueAt + 604800000;
            await updateReminder({ ...reminder, dueAt: nextDue });
          } else {
            await cancelReminder(reminder.id);
          }
        }
      } catch {
        // Scheduler failures are non-critical
      }
    }, 30000);
    return () => {
      if (schedulerRef.current) {
        clearInterval(schedulerRef.current);
      }
    };
  }, []);

  // MCP tool confirmation: bridge calls this, orchestrator resolves via voice
  useEffect(() => {
    setConfirmAction((toolName: string) => {
      return new Promise<boolean>((resolve) => {
        const msg = `Should I run the tool "${toolName}"?`;
        pendingConfirmationRef.current = {
          type: "mcp_tool",
          spokenResponse: msg,
          resolve,
          captureId: currentCaptureIdRef.current ?? undefined,
        };
        reAskRef.current = false;
        clearConfirmTimeout();
        confirmTimeoutRef.current = setTimeout(() => {
          if (pendingConfirmationRef.current?.type === "mcp_tool") {
            void handleConfirmDecline(pendingConfirmationRef.current, "I'll take that as a no.", "MCP tool confirmation timed out (15s)");
          }
        }, 15000);
        setKrishnaSpeaking(true);
        setStatus("confirming");
        setLastSpoken(msg);
        speakLogged(msg, "confirm_prompt").finally(() => setKrishnaSpeaking(false));
      });
    });

    setVerbatimConfirm((question: string) => {
      return new Promise<boolean>((resolve) => {
        pendingConfirmationRef.current = {
          type: "mcp_tool",
          spokenResponse: question,
          resolve,
          captureId: currentCaptureIdRef.current ?? undefined,
        };
        reAskRef.current = false;
        clearConfirmTimeout();
        confirmTimeoutRef.current = setTimeout(() => {
          if (pendingConfirmationRef.current?.type === "mcp_tool") {
            void handleConfirmDecline(pendingConfirmationRef.current, "I'll take that as a no.", "Gmail confirmation timed out (15s)");
          }
        }, 15000);
        setKrishnaSpeaking(true);
        setStatus("confirming");
        setLastSpoken(question);
        speakLogged(question, "confirm_prompt").finally(() => setKrishnaSpeaking(false));
      });
    });

    return () => {
      setConfirmAction(null);
      setVerbatimConfirm(null);
    };
  }, []);

  const pendingConfirmationRef = useRef<{
    type: "action" | "plan" | "memory" | "reminder" | "job_extraction" | "mcp_tool";
    spokenResponse: string;
    pendingResult?: { found: boolean; target?: string; displayName?: string; actionToResume?: string; [key: string]: any };
    input?: string;
    steps?: StepAction[];
    memoryData?: { key: string | null; value: string };
    reminderData?: { text: string; dueAt: number; recurrence: string | null };
    resolve?: (value: boolean) => void;
    captureId?: string;
  } | null>(null);
  const reAskRef = useRef(false);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearConfirmTimeout = useCallback(() => {
    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
  }, []);

  // T4-F6: single choke point for every way a pending confirmation can end WITHOUT being
  // accepted — timeout, explicit "no", or giving up after a garbled re-ask. Before this,
  // each of the 7+ call sites independently nulled the ref and fired an un-awaited,
  // un-logged `ttsRef.current.speak(...)` — so the spoken line never appeared in chat/
  // dashboard, the originating command_log row was NEVER updated (staying `pending` forever
  // or, worse, having already been marked `answered` by an earlier optimistic model reply),
  // and — for the mcp_tool case specifically — `pending.resolve` was never called on
  // timeout, leaving the awaiting caller hung indefinitely. This fixes all of that in one
  // place: the row is truthfully marked `declined`, the spoken line is recorded via
  // `recordTurn` so it shows in chat, and it goes through `speakLogged` so it shows on the
  // speech-log dashboard too.
  const handleConfirmDecline = async (
    pending: NonNullable<typeof pendingConfirmationRef.current> | null,
    spokenMsg: string,
    detail: string,
    source: SpeechSource = "timeout",
  ) => {
    pendingConfirmationRef.current = null;
    reAskRef.current = false;
    clearConfirmTimeout();
    setStatus("idle");
    if (pending?.type === "mcp_tool" && pending.resolve) {
      pending.resolve(false);
    }
    if (pending) {
      logOutcome(pending.input ?? "", "declined", "user_declined", detail, spokenMsg, "voice", pending.captureId);
      await recordTurn(pending.input ?? "", spokenMsg);
    }
    await speakLogged(spokenMsg, source, pending?.captureId);
  };

  // Barge-in: stop TTS when user starts speaking
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      unlisten = await listen("speech-start", () => {
        if (ttsRef.current.isSpeaking()) {
          ttsRef.current.stop();
          setStatus("idle");
          setKrishnaSpeaking(false);
        }
      });
    };
    setup();
    return () => {
      unlisten?.();
      clearConfirmTimeout();
    };
  }, [clearConfirmTimeout]);

  // Esc kill-switch via global shortcut (Ctrl+Shift+Escape) — works even when
  // another app is focused during computer-control sequences.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      unlisten = await listen("plan-abort", () => {
        ttsRef.current.stop();
        if (abortRef.current) {
          abortRef.current.abort();
          abortRef.current = null;
        }
        if (planAbortRef.current) {
          planAbortRef.current.abort();
          planAbortRef.current = null;
        }
        setStatus("idle");
        setKrishnaSpeaking(false);
      });
    };
    setup();
    return () => {
      unlisten?.();
    };
  }, []);

  // Explicit user save-commands that skip the confirmation gate (owner request 2026-07-04):
  // when the user literally says "remember …" / "update your database", asking "should I
  // remember?" is redundant — save straight to the DB and just confirm it's done. The confirm
  // gate still applies to PROACTIVE/inferred saves (the model deciding to remember something
  // on its own), which don't match this pattern.
  const EXPLICIT_SAVE_INTENT = /\bremember\b|\bupdate\s+(your\s+)?(data\s?base|memory|notes?)\b|\bnote\s+(this|that)\s+down\b|\bmake\s+a\s+note\b/i;

  // Single source of truth for actually persisting a memory (used by the instant-save path
  // AND the confirm-"yes" path). Persists, audit-logs (reversible), records + speaks the
  // confirmation, and logs the outcome truthfully.
  const saveMemoryNow = async (
    key: string | null,
    value: string,
    inputText: string,
    captureId?: string,
  ) => {
    const hon = getResponseSettings().honorific || "sir";
    setStatus("thinking");
    try {
      const now = Date.now();
      const memoryId = String(now);
      await createMemory({
        id: memoryId,
        key: key || null,
        value,
        source: "explicit",
        confirmed: 1,
        createdAt: now,
        lastUsedAt: null,
      });
      try {
        await createAuditEntry({
          id: String(Date.now()),
          actionType: "memory_write",
          summary: "Remembered " + value,
          result: "ok",
          reversible: 1,
          undoPayload: JSON.stringify({ kind: "memory", id: memoryId }),
          createdAt: Date.now(),
        });
      } catch { /* non-critical */ }
      const speak = key ? `Saved your ${key}, ${hon}.` : `Saved, ${hon}.`;
      logOutcome(inputText ?? "", "answered", undefined, undefined, speak, "voice", captureId);
      await recordTurn(inputText || "", speak);
      setLastSpoken(speak);
      setKrishnaSpeaking(true);
      setStatus("speaking");
      try {
        await speakLogged(speak, "answer", captureId);
      } finally {
        setKrishnaSpeaking(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save memory";
      logOutcome(inputText ?? "", "failed", "tool_failed", msg, undefined, "voice", captureId);
      const line = `I had trouble saving that, ${hon}.`;
      await recordTurn(inputText || "", line);
      setStatus("speaking");
      setKrishnaSpeaking(true);
      try {
        await speakLogged(line, "error", captureId);
      } finally {
        setKrishnaSpeaking(false);
      }
    } finally {
      setStatus("idle");
    }
  };

  const promptMemoryConfirmation = useCallback(async (key: string | null, value: string, inputText: string) => {
    // Instant-save fast path: the user explicitly commanded a save — skip the confirm gate.
    if (EXPLICIT_SAVE_INTENT.test(inputText)) {
      await saveMemoryNow(key, value, inputText, currentCaptureIdRef.current ?? undefined);
      return;
    }
    // T4-F6(c): keep the read-back SHORT so it doesn't consume the 15s confirm window when the
    // value is long (e.g. a full address). Ask by key when we have one; only read a short value
    // back when there's no label to refer to.
    const spokenResponse = key
      ? "Should I remember your " + key + "?"
      : "Should I remember that" + (value.length <= 40 ? ' — "' + value + '"' : "") + "?";
    pendingConfirmationRef.current = {
      type: "memory",
      spokenResponse,
      memoryData: { key, value },
      input: inputText,
      captureId: currentCaptureIdRef.current ?? undefined,
    };
    const thisPending = pendingConfirmationRef.current;
    reAskRef.current = false;
    clearConfirmTimeout();
    confirmTimeoutRef.current = setTimeout(() => {
      void handleConfirmDecline(thisPending, "I'll forget about it.", "Memory confirmation timed out (15s)");
    }, 15000);
    setStatus("confirming");
    setLastSpoken(spokenResponse);
    setKrishnaSpeaking(true);
    try {
      await speakLogged(spokenResponse, "confirm_prompt", thisPending.captureId);
    } finally {
      setKrishnaSpeaking(false);
    }
  }, [clearConfirmTimeout]);

  const setKrishnaEnabled = useCallback((value: boolean) => {
    setEnabled(value);
    safeLocalStorage.setItem(STORAGE_KEYS.KRISHNA_ENABLED, String(value));
  }, []);

  const setVoice = useCallback((name: string) => {
    setVoiceState(name);
    safeLocalStorage.setItem(STORAGE_KEYS.KRISHNA_VOICE, name);
    const allVoices = window.speechSynthesis?.getVoices() ?? [];
    const found = allVoices.find((v) => v.name === name);
    if (found) ttsRef.current.setVoice(found);
  }, []);

  const setRate = useCallback((v: number) => {
    setRateState(v);
    safeLocalStorage.setItem(STORAGE_KEYS.KRISHNA_RATE, String(v));
    ttsRef.current.setRate(v);
  }, []);

  const setLlmFallback = useCallback((value: boolean) => {
    setLlmFallbackEnabled(value);
    safeLocalStorage.setItem(STORAGE_KEYS.KRISHNA_LLM_FALLBACK, String(value));
  }, []);

  const stopSpeaking = useCallback(() => {
    ttsRef.current.stop();
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus("idle");
    setKrishnaSpeaking(false);
  }, []);

  const [llmFallbackEnabled, setLlmFallbackEnabled] = useState<boolean>(() => {
    return safeLocalStorage.getItem(STORAGE_KEYS.KRISHNA_LLM_FALLBACK) !== "false";
  });

  const llmFallback = useCallback(
    async (input: string): Promise<string | null> => {
      if (!llmFallbackEnabled) return null;
      if (!selectedAIProvider.provider) return null;
      const provider = allAiProviders.find((p) => p.id === selectedAIProvider.provider);
      if (!provider) return null;

      const fallbackPrompt = "The user wants to launch '" + input + "' on Windows. What is the most likely executable name, .lnk path, or file path? Respond with just the path/name, nothing else.";
      try {
        let response = "";
        for await (const chunk of fetchAIResponse({
          provider,
          selectedProvider: selectedAIProvider,
          systemPrompt: "You resolve Windows app names to executable paths. Reply with only the path or name.",
          history: [],
          userMessage: fallbackPrompt,
          imagesBase64: [],
          signal: new AbortController().signal,
        })) {
          response += chunk;
        }
        const cleaned = response.trim().split("\n")[0]?.trim() || "";
        return cleaned.length > 0 ? cleaned : null;
      } catch {
        return null;
      }
    },
    [selectedAIProvider, allAiProviders]
  );

  const processCommand = useCallback(
    async (transcription: string, opts?: { skipWakeWord?: boolean; voiceVerifyResult?: VoiceVerifyResult }) => {
      if (pendingConfirmationRef.current) {
        clearConfirmTimeout();
        const pending = pendingConfirmationRef.current;
        const answer = parseYesNo(transcription);
        if (answer === "yes") {
          pendingConfirmationRef.current = null;
          reAskRef.current = false;
          if (pending.type === "plan" && pending.steps) {
            setStatus("thinking");
            try {
              planAbortRef.current = new AbortController();
              const result = await executePlan(pending.steps, { signal: planAbortRef.current.signal });
              planAbortRef.current = null;
              if (result.success) {
                const successMsg = result.finalOutput || "Plan completed successfully.";
                // Learn as a skill for future use (parametrized pattern)
                try {
                  if (pending.input) {
                    const skillName = pending.input.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().split(/\s+/).slice(0, 5).join("-");
                    const existing = await getSkillByName(skillName);
                    if (!existing) {
                      const now = Date.now();
                      const { pattern, params, planTemplate } = derivePattern(pending.input, pending.steps);
                      const skill: Skill = {
                        id: now,
                        name: skillName,
                        triggerExamples: pattern,
                        params,
                        planTemplate,
                        confirmedByUser: 1,
                        useCount: 1,
                        createdAt: now,
                      };
                      await createSkill(skill);
                    } else {
                      await updateSkillUseCount(existing.id);
                    }
                  }
                } catch {
                  // Non-critical: skill persistence failure shouldn't break UX
                }
                try {
                  await createAuditEntry({
                    id: String(Date.now()),
                    actionType: "skill",
                    summary: successMsg,
                    result: "ok",
                    reversible: 0,
                    undoPayload: null,
                    createdAt: Date.now(),
                  });
                } catch { /* non-critical */ }
                await recordTurn(pending.input || "", successMsg);
                logOutcome(pending.input ?? "", "answered", undefined, undefined, successMsg, "voice", pending.captureId);
                setLastSpoken(successMsg);
                setKrishnaSpeaking(true);
                setStatus("speaking");
                try {
                  await speakLogged(successMsg, "answer", pending.captureId);
                } finally {
                  setKrishnaSpeaking(false);
                }
              } else {
                const errorMsg = result.error || "Plan execution failed.";
                logOutcome(pending.input ?? "", "failed", "plan_failed", errorMsg, errorMsg, "voice", pending.captureId);
                await recordTurn(pending.input || "", errorMsg);
                setLastSpoken(errorMsg);
                setKrishnaSpeaking(true);
                setStatus("speaking");
                try {
                  await speakLogged(errorMsg, "error", pending.captureId);
                } finally {
                  setKrishnaSpeaking(false);
                }
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Plan execution failed";
              logOutcome(pending.input ?? "", "failed", "plan_failed", msg, undefined, "voice", pending.captureId);
              await recordTurn(pending.input || "", "I had trouble: " + msg);
              setStatus("speaking");
              setKrishnaSpeaking(true);
              try {
                await speakLogged("I had trouble: " + msg, "error", pending.captureId);
              } finally {
                setKrishnaSpeaking(false);
              }
            } finally {
              setStatus("idle");
            }
          } else if (pending.type === "memory" && pending.memoryData) {
            await saveMemoryNow(
              pending.memoryData.key || null,
              pending.memoryData.value,
              pending.input ?? "",
              pending.captureId,
            );
          } else if (pending.type === "mcp_tool" && pending.resolve) {
            pending.resolve(true);
            setStatus("thinking");
            return;
          } else if (pending.type === "action" && pending.pendingResult?.actionToResume) {
            setStatus("thinking");
            try {
              const action = JSON.parse(pending.pendingResult.actionToResume);
              const result = await executeAction(action, llmFallback);
              if (result.spokenResponse) {
                const plan = decideActionResponse(result, false);
                if (plan?.shouldSpeak) {
                  if (plan.recordTurn) {
                    await recordTurn(pending.input || "", result.spokenResponse);
                  }
                  logOutcome(
                    pending.input ?? "",
                    plan.outcome,
                    plan.failureReason,
                    plan.detail,
                    result.spokenResponse,
                    "voice",
                    pending.captureId,
                  );
                  setLastSpoken(result.spokenResponse);
                  setKrishnaSpeaking(true);
                  setStatus("speaking");
                  try {
                    await speakLogged(result.spokenResponse, plan.outcome === "answered" ? "answer" : "error", pending.captureId);
                  } finally {
                    setKrishnaSpeaking(false);
                  }
                }
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Failed to execute action";
              logOutcome(pending.input ?? "", "failed", "tool_failed", msg, undefined, "voice", pending.captureId);
              await recordTurn(pending.input || "", "I had trouble: " + msg);
              setStatus("speaking");
              setKrishnaSpeaking(true);
              try {
                await speakLogged("I had trouble: " + msg, "error", pending.captureId);
              } finally {
                setKrishnaSpeaking(false);
              }
            } finally {
              setStatus("idle");
            }
          } else if (pending.type === "job_extraction") {
            setStatus("thinking");
            try {
              const result = await triggerJobExtractionWorkflow();
              const speak = result.success
                ? "Started your daily job extraction. You'll get the email report shortly."
                : "I couldn't start it: " + (result.error || "unknown error");
              logOutcome(
                pending.input ?? "",
                result.success ? "answered" : "failed",
                result.success ? undefined : "tool_failed",
                result.success ? undefined : result.error,
                speak,
                "voice",
                pending.captureId,
              );
              try {
                await createAuditEntry({
                  id: String(Date.now()),
                  actionType: "job_extraction",
                  summary: speak,
                  result: result.success ? "ok" : "failed",
                  reversible: 0,
                  undoPayload: null,
                  createdAt: Date.now(),
                });
              } catch { /* non-critical */ }
              await recordTurn(pending.input || "", speak);
              setLastSpoken(speak);
              setKrishnaSpeaking(true);
              setStatus("speaking");
              try {
                await speakLogged(speak, "answer", pending.captureId);
              } finally {
                setKrishnaSpeaking(false);
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Failed to trigger job extraction";
              logOutcome(pending.input ?? "", "failed", "tool_failed", msg, undefined, "voice", pending.captureId);
              await recordTurn(pending.input || "", "I had trouble: " + msg);
              setStatus("speaking");
              setKrishnaSpeaking(true);
              try {
                await speakLogged("I had trouble: " + msg, "error", pending.captureId);
              } finally {
                setKrishnaSpeaking(false);
              }
            } finally {
              setStatus("idle");
            }
          } else if (pending.type === "reminder" && pending.reminderData) {
            setStatus("thinking");
            try {
              const now = Date.now();
              await createReminder({
                id: String(now),
                text: pending.reminderData.text,
                dueAt: pending.reminderData.dueAt,
                recurrence: pending.reminderData.recurrence,
                skillId: null,
                enabled: 1,
                createdAt: now,
              });
              try {
                await createAuditEntry({
                  id: String(now + 1),
                  actionType: "reminder",
                  summary: "Set reminder: " + pending.reminderData.text,
                  result: "ok",
                  reversible: 1,
                  undoPayload: JSON.stringify({ kind: "reminder", id: String(now) }),
                  createdAt: now + 1,
                });
              } catch { /* non-critical */ }
              const speak = "Got it, I'll remind you to " + pending.reminderData.text + ".";
              logOutcome(pending.input ?? "", "answered", undefined, undefined, speak, "voice", pending.captureId);
              await recordTurn(pending.input || "", speak);
              setLastSpoken(speak);
              setKrishnaSpeaking(true);
              setStatus("speaking");
              try {
                await speakLogged(speak, "answer", pending.captureId);
              } finally {
                setKrishnaSpeaking(false);
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Failed to set reminder";
              logOutcome(pending.input ?? "", "failed", "tool_failed", msg, undefined, "voice", pending.captureId);
              await recordTurn(pending.input || "", "I had trouble: " + msg);
              setStatus("speaking");
              setKrishnaSpeaking(true);
              try {
                await speakLogged("I had trouble: " + msg, "error", pending.captureId);
              } finally {
                setKrishnaSpeaking(false);
              }
            } finally {
              setStatus("idle");
            }
          } else if (pending.pendingResult?.target) {
            if (pending.input) {
              await saveAndConfirm(pending.pendingResult as any, pending.input);
            }
            setStatus("speaking");
            try {
              await invoke("open_target", { target: pending.pendingResult.target });
              try {
                await createAuditEntry({
                  id: String(Date.now()),
                  actionType: "open_target",
                  summary: "Opening " + pending.pendingResult.displayName,
                  result: "ok",
                  reversible: 0,
                  undoPayload: null,
                  createdAt: Date.now(),
                });
              } catch { /* non-critical */ }
              const speak = "Opening " + pending.pendingResult.displayName;
              logOutcome(pending.input ?? "", "answered", undefined, undefined, speak, "voice", pending.captureId);
              await recordTurn(pending.input || "", speak);
              setLastSpoken(speak);
              setKrishnaSpeaking(true);
              await speakLogged(speak, "status", pending.captureId);
            } finally {
              setKrishnaSpeaking(false);
              setStatus("idle");
            }
          }
          return;
        }
        if (answer === "no") {
          const speak = "Okay, I won't do that.";
          setLastSpoken(speak);
          setStatus("speaking");
          setKrishnaSpeaking(true);
          try {
            await handleConfirmDecline(pending, speak, "User said no", "decline");
          } finally {
            setKrishnaSpeaking(false);
          }
          return;
        }
        if (!reAskRef.current) {
          reAskRef.current = true;
          setStatus("speaking");
          try {
            const speak = "Sorry, I didn't catch that. Should I go ahead? Say yes or no.";
            setLastSpoken(speak);
            setKrishnaSpeaking(true);
            await speakLogged(speak, "reask", pending.captureId);
          } finally {
            setKrishnaSpeaking(false);
          }
          return;
        }
        {
          const speak = "I didn't catch a clear answer, so I'll skip that for now.";
          setLastSpoken(speak);
          setStatus("speaking");
          setKrishnaSpeaking(true);
          try {
            await handleConfirmDecline(pending, speak, "No clear yes/no after re-ask", "decline");
          } finally {
            setKrishnaSpeaking(false);
          }
        }
        return;
      }

      let command = transcription.trim() || "hello";

      // Voice-ID enforcement: gate only when gallery is mature
      const voiceResult = opts?.voiceVerifyResult;
      const isUnverified = voiceResult
        ? voiceResult.enrolled && voiceResult.mature && !voiceResult.match
        : false;

      if (wakeWordEnabled && !opts?.skipWakeWord && !pendingConfirmationRef.current) {
        const { detected, remainder } = detectWakeWord(transcription, wakeWord);
        if (!detected) {
          setStatus("idle");
          return;
        }
        command = remainder || command;
      }

      pendingUserTextRef.current = command;
      setLastError(null);
      setPendingCommand(command);
      setStatus("thinking");

      const turnTiming = new TurnTiming();
      turnTiming.mark("end_of_speech");

      // INSERT pending row immediately so it's visible in the Dashboard live view
      const captureId = crypto.randomUUID();
      currentCaptureIdRef.current = captureId;
      insertPendingCommand({ id: captureId, transcript: command, source: "voice", createdAt: Date.now() }).catch((err) =>
        console.error("Failed to insert pending command:", err)
      );
      emit("command-log-updated").catch(() => {});

      // Phase 2: zero-LLM fast path for greetings/thanks/acknowledgments
      const cannedHonorific = getResponseSettings().honorific || "sir";
      const canned = matchCannedResponse(command, cannedHonorific);
      if (canned) {
        const speak = canned.response;
        await recordTurn(pendingUserTextRef.current, speak);
        logOutcome(command, "answered", undefined, undefined, speak);
        setLastSpoken(speak);
        setKrishnaSpeaking(true);
        setStatus("speaking");
        try {
          turnTiming.mark("first_audio");
          await speakLogged(speak, "canned", captureId);
        } finally {
          turnTiming.mark("last_audio");
          setKrishnaSpeaking(false);
        }
        turnTiming.freeze();
        updateCommandTiming({ id: captureId, timing: turnTiming.toJSON() }).catch((err) =>
          console.error("Failed to persist turn timing:", err)
        );
        emit("command-log-updated").catch(() => {});
        setStatus("idle");
        return;
      }

      if (!selectedAIProvider.provider) {
        const errMsg = "No AI provider configured — open Settings › Brain.";
        setLastError(errMsg);
        setStatus("idle");
        logOutcome(command, "failed", "no_ai_provider", errMsg);
        return;
      }
      const provider = allAiProviders.find(
        (p) => p.id === selectedAIProvider.provider
      );
      if (!provider) {
        const errMsg = "AI provider not found — check Settings › Brain.";
        setLastError(errMsg);
        setStatus("idle");
        logOutcome(command, "failed", "ai_error", errMsg);
        return;
      }

      // Skill match: check if the command matches a learned skill (pattern-based)
      try {
        const skills = await getAllSkills();
        for (const skill of skills) {
          const vars = matchSkillPattern(command, skill);
          if (vars !== null) {
            const rawSteps: StepAction[] = JSON.parse(skill.planTemplate);
            const steps: StepAction[] = rawSteps.map(step => ({
              ...step,
              args: Object.fromEntries(
                Object.entries(step.args).map(([k, v]) => [k, resolvePlaceholders(v, vars)])
              ),
            }));

            // Require confirmation if any step opens a URL or file path
            const hasSensitiveStep = steps.some(s =>
              s.tool === "open_target" && (
                s.args.target?.startsWith("http://") ||
                s.args.target?.startsWith("https://") ||
                s.args.target?.includes("/") ||
                s.args.target?.includes("\\")
              )
            );
            // Unverified speaker: always force confirmation (soft mode)
            if (isUnverified || hasSensitiveStep) {
              const skillPrompt = "Should I run the skill \"" + skill.name + "\"?";
              pendingConfirmationRef.current = {
                type: "plan",
                spokenResponse: skillPrompt,
                steps,
                input: command,
                captureId: currentCaptureIdRef.current ?? undefined,
              };
              const thisPending = pendingConfirmationRef.current;
              reAskRef.current = false;
              clearConfirmTimeout();
              confirmTimeoutRef.current = setTimeout(() => {
                void handleConfirmDecline(thisPending, "I'll take that as a no.", "Skill confirmation timed out (15s)");
              }, 15000);
              setStatus("confirming");
              setLastSpoken(skillPrompt);
              setKrishnaSpeaking(true);
              try {
                await speakLogged(skillPrompt, "confirm_prompt", thisPending.captureId);
              } finally {
                setKrishnaSpeaking(false);
              }
              return;
            }

            setStatus("thinking");
            let skillHandled = true;
            try {
              planAbortRef.current = new AbortController();
              const result = await executePlan(steps, { signal: planAbortRef.current.signal });
              planAbortRef.current = null;
              await updateSkillUseCount(skill.id);
              if (result.success) {
                const msg = result.finalOutput || "Done!";
                await recordTurn(pendingUserTextRef.current, msg);
                logOutcome(pendingUserTextRef.current, "answered", undefined, undefined, msg);
                setLastSpoken(msg);
                setKrishnaSpeaking(true);
                setStatus("speaking");
                try {
                  await speakLogged(msg, "answer");
                } finally {
                  setKrishnaSpeaking(false);
                }
              } else {
                const msg = result.error || "Failed to execute skill.";
                await recordTurn(pendingUserTextRef.current, msg);
                logOutcome(pendingUserTextRef.current, "failed", "plan_failed", result.error, msg);
                setLastSpoken(msg);
                setKrishnaSpeaking(true);
                setStatus("speaking");
                try {
                  await speakLogged(msg, "error");
                } finally {
                  setKrishnaSpeaking(false);
                }
              }
            } catch (parseErr) {
              // Invalid plan template — don't silently dead-end. Log for diagnostics
              // and fall through to the LLM path (don't return). No command-outcome row
              // here: the LLM path that follows decides the real outcome.
              console.error("Skill plan template failed to parse, falling through to LLM:", parseErr);
              skillHandled = false;
            } finally {
              setStatus("idle");
            }
            if (skillHandled) return;
            break;
          }
        }
      } catch (skillsErr) {
        // Skills lookup unavailable (e.g. DB) — fall through to LLM. Surface it instead
        // of swallowing silently; the command still proceeds, so no failure row.
        console.warn("Skill lookup failed, falling through to LLM:", skillsErr);
      }

      // Memory save: "remember that..."
      const rememberResult = parseRememberCommand(command);
      if (rememberResult && rememberResult.value) {
        const { key, value } = rememberResult;
        await promptMemoryConfirmation(key, value, command);
        return;
      }

      // Job pipeline status: "what's the pipeline status" — read-only, NO confirmation.
      // Checked BEFORE the trigger so a status query never accidentally fires a run.
      if (isJobStatusCommand(command)) {
        setStatus("thinking");
        const status = await getJobExtractionStatus();
        const msg = status.success
          ? (status.summary ?? "I checked, but couldn't read the run status.")
          : `I couldn't check the pipeline status: ${status.error}`;
        await recordTurn(pendingUserTextRef.current, msg);
        logOutcome(
          command,
          status.success ? "answered" : "failed",
          status.success ? undefined : "tool_failed",
          status.success ? undefined : status.error,
          msg,
        );
        setLastSpoken(msg);
        setKrishnaSpeaking(true);
        setStatus("speaking");
        try {
          await speakLogged(msg, "answer");
        } finally {
          setKrishnaSpeaking(false);
          setStatus("idle");
        }
        return;
      }

      // Job extraction: "run my daily job extraction"
      if (isJobExtractionCommand(command)) {
        const jobPrompt = "Should I run your daily job extraction now?";
        pendingConfirmationRef.current = {
          type: "job_extraction",
          spokenResponse: jobPrompt,
          input: command,
          captureId: currentCaptureIdRef.current ?? undefined,
        };
        const thisPending = pendingConfirmationRef.current;
        reAskRef.current = false;
        clearConfirmTimeout();
        confirmTimeoutRef.current = setTimeout(() => {
          void handleConfirmDecline(thisPending, "Okay, I won't run it.", "Job extraction confirmation timed out (15s)");
        }, 15000);
        setStatus("confirming");
        setLastSpoken(jobPrompt);
        setKrishnaSpeaking(true);
        try {
          await speakLogged(jobPrompt, "confirm_prompt", thisPending.captureId);
        } finally {
          setKrishnaSpeaking(false);
        }
        return;
      }

      // Reminder: "remind me..."
      const reminderResult = parseReminderCommand(command);
      if (reminderResult) {
        const reminderPrompt = "Should I remind you to " + reminderResult.text + "?";
        pendingConfirmationRef.current = {
          type: "reminder",
          spokenResponse: reminderPrompt,
          reminderData: reminderResult,
          input: command,
          captureId: currentCaptureIdRef.current ?? undefined,
        };
        const thisPending = pendingConfirmationRef.current;
        reAskRef.current = false;
        clearConfirmTimeout();
        confirmTimeoutRef.current = setTimeout(() => {
          void handleConfirmDecline(thisPending, "I'll forget about it.", "Reminder confirmation timed out (15s)");
        }, 15000);
        setStatus("confirming");
        setLastSpoken(reminderPrompt);
        setKrishnaSpeaking(true);
        try {
          await speakLogged(reminderPrompt, "confirm_prompt", thisPending.captureId);
        } finally {
          setKrishnaSpeaking(false);
        }
        return;
      }

      // Perception: "look at my screen"
      if (isLookCommand(command)) {
        setStatus("thinking");
        try {
          const img = await invoke<string>("capture_to_base64");
          const visionPrompt = "Describe what's on the user's screen and answer their question.";
          let visionResponse = "";
          for await (const chunk of fetchAIResponse({
            provider,
            selectedProvider: selectedAIProvider,
            systemPrompt: visionPrompt,
            history: [],
            userMessage: command,
            imagesBase64: [img],
            signal: new AbortController().signal,
          })) {
            visionResponse += chunk;
          }
          const { spokenText } = parseActions(visionResponse);
          const speak = spokenText || visionResponse;
          await recordTurn(pendingUserTextRef.current, speak);
          setLastSpoken(speak);
          setKrishnaSpeaking(true);
          setStatus("speaking");
          try {
            await speakLogged(speak, "answer");
          } finally {
            setKrishnaSpeaking(false);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to capture screen";
          await recordTurn(pendingUserTextRef.current, "I had trouble looking at your screen: " + msg);
          setStatus("speaking");
          setKrishnaSpeaking(true);
          try {
            await speakLogged("I had trouble looking at your screen: " + msg, "error");
          } finally {
            setKrishnaSpeaking(false);
          }
          } finally {
            setStatus("idle");
          }
          return;
        }

        // Undo: "undo that"
        if (isUndoCommand(command)) {
          setStatus("thinking");
          try {
            const last = await getLastReversible();
            if (!last) {
              setStatus("speaking");
              setKrishnaSpeaking(true);
              try {
                await speakLogged("There's nothing to undo.", "answer");
              } finally {
                setKrishnaSpeaking(false);
              }
              setStatus("idle");
              return;
            }
            const payload = last.undoPayload ? JSON.parse(last.undoPayload) : null;
            let undoSuccess = false;
            if (payload?.kind === "memory" && payload.id) {
              const { deleteMemory } = await import("@/lib/repo-bound");
              await deleteMemory(payload.id);
              undoSuccess = true;
            }
            const speak = undoSuccess ? "Done, I've undone that." : "I can't undo that action.";
            await recordTurn(pendingUserTextRef.current, speak);
            setLastSpoken(speak);
            setKrishnaSpeaking(true);
            setStatus("speaking");
            try {
              await speakLogged(speak, "answer");
            } finally {
              setKrishnaSpeaking(false);
            }
          } catch {
            await recordTurn(pendingUserTextRef.current, "I had trouble undoing that.");
            setStatus("speaking");
            setKrishnaSpeaking(true);
            try {
              await speakLogged("I had trouble undoing that.", "error");
            } finally {
              setKrishnaSpeaking(false);
            }
          } finally {
            setStatus("idle");
          }
          return;
        }

        abortRef.current = new AbortController();
      const signal = abortRef.current.signal;
      let usageData: { prompt_tokens?: number; completion_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined;

      try {
        historyRef.current = [...historyRef.current, { role: "user" as const, content: command }].slice(-8);
        const memories = await getAllMemories();
        setSpokenUrlNames(
          memories,
          APP_ALIASES.filter(a => a.type === "url"),
        );
        const now = new Date();
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const timeContext = `\n\nCurrent date and time: ${now.toLocaleString("en-IN", { timeZone, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
        const toolsSection = buildToolsSection(command);
        const honorific = getResponseSettings().honorific || "sir";
        const personaPrefix = selectedSystemPrompt && selectedSystemPrompt !== DEFAULT_SYSTEM_PROMPT
          ? selectedSystemPrompt.replace(/\{honorific\}/g, honorific) + "\n\n"
          : "";
        const stableBase = (personaPrefix + BASE_SYSTEM_PROMPT + "\n\n" + toolsSection + SYSTEM_PROMPT_RULES)
          .replace(/\{honorific\}/g, honorific);
        const confirmedMemories = memories.filter(m => m.confirmed && m.value);
        const memoryBlock = confirmedMemories.length > 0
          ? "\n\nThings I know about the user:\n" + confirmedMemories.map(m => "- " + (m.key ? m.key + ": " : "") + m.value).join("\n") + "\n\nUse these facts when relevant."
          : "";
        const volatilePrompt = timeContext + memoryBlock;
        let fullResponse = "";
        fillerSpokenRef.current = false;
        turnTiming.mark("request_sent");
        fillerTimerRef.current = setTimeout(() => {
          if (!fillerSpokenRef.current) {
            fillerSpokenRef.current = true;
            fillerPromiseRef.current = speakLogged("One moment, " + honorific, "filler").then(() => {
              fillerPromiseRef.current = null;
            }).catch(() => {
              fillerPromiseRef.current = null;
            });
          }
        }, 1500);
        let firstChunk = true;
        const voiceSettings = getResponseSettings();
        for await (const chunk of fetchAIResponse({
          provider,
          selectedProvider: selectedAIProvider,
          stableSystemPrompt: stableBase,
          volatileSystemPrompt: volatilePrompt,
          history: historyRef.current,
          userMessage: command,
          imagesBase64: attachedFilesRef.current.map(f => f.base64),
          signal,
          maxOutputTokens: voiceSettings.voiceMaxTokens,
          modelOverride: voiceSettings.voiceModel || undefined,
          onUsage: (u) => {
            if (!usageData) usageData = {};
            if (u.prompt_tokens !== undefined) usageData.prompt_tokens = u.prompt_tokens;
            if (u.completion_tokens !== undefined) usageData.completion_tokens = u.completion_tokens;
            if (u.cache_read_input_tokens !== undefined) usageData.cache_read_input_tokens = u.cache_read_input_tokens;
            if (u.cache_creation_input_tokens !== undefined) usageData.cache_creation_input_tokens = u.cache_creation_input_tokens;
          },
        })) {
          if (signal.aborted) break;
          if (firstChunk) {
            firstChunk = false;
            turnTiming.mark("first_token");
          }
          fullResponse += chunk;
        }
        turnTiming.mark("last_token");

        if (!fullResponse || signal.aborted) {
          setStatus("idle");
          return;
        }

        const { spokenText, actions, plan } = parseActions(fullResponse);

        // Suppress generic filler when reply is a plan-ack (the plan.say is sufficient)
        if (plan?.steps.length) {
          clearTimeout(fillerTimerRef.current!);
          fillerTimerRef.current = null;
        }

        historyRef.current = [...historyRef.current, { role: "assistant" as const, content: fullResponse }].slice(-8);
        let spokenTextRecorded = false;

        // T4-F1 claimed-save grounding: the model spoke a save claim but emitted no remember
        // action, so nothing was persisted. Speak an honest correction, AND scrub the false
        // claim from history (line above just pushed `fullResponse`) — otherwise the model
        // sees its own lie next turn and keeps believing the address was saved.
        if (detectPhantomSave(command, spokenText, actions)) {
          const hon = getResponseSettings().honorific || "sir";
          const overrideText = `I couldn't save that properly, ${hon} — please tell me once more.`;
          historyRef.current = [
            ...historyRef.current.slice(0, -1),
            { role: "assistant" as const, content: overrideText },
          ].slice(-8);
          await recordTurn(pendingUserTextRef.current, overrideText);
          logOutcome(command, "failed", "tool_failed", "save claimed without remember action", overrideText);
          setStatus("speaking");
          setLastSpoken(overrideText);
          setKrishnaSpeaking(true);
          try {
            clearTimeout(fillerTimerRef.current!);
            fillerTimerRef.current = null;
            if (fillerPromiseRef.current) {
              await fillerPromiseRef.current;
            }
            await speakLogged(overrideText, "status");
          } finally {
            setKrishnaSpeaking(false);
          }
          const cId = currentCaptureIdRef.current;
          if (cId) {
            if (usageData) turnTiming.setUsage(usageData);
            turnTiming.freeze();
            updateCommandTiming({ id: cId, timing: turnTiming.toJSON() }).catch((err) =>
              console.error("Failed to persist turn timing:", err)
            );
            emit("command-log-updated").catch(() => {});
          }
          setStatus("idle");
          return;
        }

        if (spokenText) {
          await recordTurn(pendingUserTextRef.current, spokenText);
          logOutcome(command, "answered", undefined, undefined, spokenText);
          spokenTextRecorded = true;
          setStatus("speaking");
          setLastSpoken(spokenText);
          setKrishnaSpeaking(true);
          try {
            // Wait for filler to finish naturally (rare with 1500ms threshold)
            clearTimeout(fillerTimerRef.current!);
            fillerTimerRef.current = null;
            if (fillerPromiseRef.current) {
              await fillerPromiseRef.current;
            }
            turnTiming.mark("first_audio");
            await speakLogged(spokenText, "answer");
          } finally {
            turnTiming.mark("last_audio");
            setKrishnaSpeaking(false);
          }
          const cId = currentCaptureIdRef.current;
          if (cId) {
            if (usageData) turnTiming.setUsage(usageData);
            turnTiming.freeze();
            updateCommandTiming({ id: cId, timing: turnTiming.toJSON() }).catch((err) =>
              console.error("Failed to persist turn timing:", err)
            );
            emit("command-log-updated").catch(() => {});
          }
        }

        // Handle plan (multi-step)
        if (plan && plan.steps.length > 0) {
          pendingConfirmationRef.current = {
            type: "plan",
            spokenResponse: plan.say,
            steps: plan.steps,
            input: command,
            captureId: currentCaptureIdRef.current ?? undefined,
          };
          const thisPending = pendingConfirmationRef.current;
          reAskRef.current = false;
          clearConfirmTimeout();
          confirmTimeoutRef.current = setTimeout(() => {
            void handleConfirmDecline(thisPending, "I'll take that as a no.", "Plan confirmation timed out (15s)");
          }, 15000);
          setStatus("confirming");
          setLastSpoken(plan.say);
          setKrishnaSpeaking(true);
          try {
            await speakLogged(plan.say, "confirm_prompt", thisPending.captureId);
          } finally {
            setKrishnaSpeaking(false);
          }
          return;
        }

        // Handle legacy single actions
        for (const action of actions) {
          // Intercept memory action before executeAction (which only handles "open")
          if (action.action === "remember") {
            await promptMemoryConfirmation(action.key, action.value, command);
            return;
          }
          const result = isUnverified
            ? await resolveActionForConfirm(action, llmFallback)
            : await executeAction(action, llmFallback);
          if (result.needsConfirmation && result.pendingResult) {
            pendingConfirmationRef.current = {
              type: "action",
              spokenResponse: result.spokenResponse,
              pendingResult: result.pendingResult as any,
              input: result.input,
              captureId: currentCaptureIdRef.current ?? undefined,
            };
            const thisPending = pendingConfirmationRef.current;
            reAskRef.current = false;
            clearConfirmTimeout();
            confirmTimeoutRef.current = setTimeout(() => {
              void handleConfirmDecline(thisPending, "I'll take that as a no.", "Action confirmation timed out (15s)");
            }, 15000);
            setStatus("confirming");
            setLastSpoken(result.spokenResponse);
            setKrishnaSpeaking(true);
            try {
              await speakLogged(result.spokenResponse, "confirm_prompt", thisPending.captureId);
            } finally {
              setKrishnaSpeaking(false);
            }
            return;
          }
            if (result.spokenResponse) {
              const plan = decideActionResponse(result, spokenTextRecorded);
              if (plan?.shouldSpeak) {
                if (plan.recordTurn) {
                  await recordTurn(pendingUserTextRef.current, result.spokenResponse);
                }
                logOutcome(
                  command,
                  plan.outcome,
                  plan.failureReason,
                  plan.detail,
                  result.spokenResponse,
                );
                setStatus("speaking");
                setLastSpoken(result.spokenResponse);
                setKrishnaSpeaking(true);
                try {
                  await speakLogged(result.spokenResponse, result.kind === "status" ? "status" : "answer");
                } finally {
                  setKrishnaSpeaking(false);
                }
              }
            } else {
              // Action ran but produced no response and asked for no confirmation —
              // treat as an uncaptured tool failure rather than letting it vanish.
              logOutcome(command, "failed", "tool_failed", "action produced no response");
            }
          }
      } catch (err) {
        clearTimeout(fillerTimerRef.current!);
        fillerTimerRef.current = null;
        if (signal.aborted) {
          setStatus("idle");
          return;
        }
        const rawMsg = err instanceof Error ? err.message : "Something went wrong";
        const hon = getResponseSettings().honorific || "sir";
        let humanMsg: string;
        let logDetail: string;
        if (rawMsg.includes("__KRNET__:")) {
          humanMsg = `I'm having network trouble, ${hon} — give me a moment and try again.`;
          logDetail = rawMsg.slice(rawMsg.indexOf("__KRNET__:") + 10);
        } else if (rawMsg.includes("__KRAPI__:")) {
          humanMsg = `The AI service had a problem, ${hon}.`;
          logDetail = rawMsg.slice(rawMsg.indexOf("__KRAPI__:") + 10);
        } else if (rawMsg.includes("__KRPARSE__:")) {
          humanMsg = `I had trouble processing the response, ${hon}.`;
          logDetail = rawMsg.slice(rawMsg.indexOf("__KRPARSE__:") + 12);
        } else if (rawMsg.includes("__KRSTREAM__:")) {
          humanMsg = `I had trouble processing the response, ${hon}.`;
          logDetail = rawMsg.slice(rawMsg.indexOf("__KRSTREAM__:") + 13);
        } else {
          humanMsg = `Something unexpected went wrong, ${hon}.`;
          logDetail = rawMsg;
        }
        setLastError(logDetail);
        turnTiming.mark("last_token");
        logOutcome(command, "failed", "ai_error", logDetail);
        setStatus("speaking");
        setKrishnaSpeaking(true);
        try {
          turnTiming.mark("first_audio");
          await speakLogged(humanMsg, "error");
        } finally {
          turnTiming.mark("last_audio");
          setKrishnaSpeaking(false);
        }
        const cId = currentCaptureIdRef.current;
        if (cId) {
          if (usageData) turnTiming.setUsage(usageData);
          turnTiming.freeze();
          updateCommandTiming({ id: cId, timing: turnTiming.toJSON() }).catch((err) =>
            console.error("Failed to persist turn timing:", err)
          );
          emit("command-log-updated").catch(() => {});
        }
      } finally {
        clearFiles();
        setPendingCommand(null);
        if (!pendingConfirmationRef.current) {
          setStatus("idle");
        }
      }
    },
    [selectedAIProvider, allAiProviders, llmFallback, wakeWordEnabled, wakeWord, clearFiles, promptMemoryConfirmation]
  );

  // Presence overlay: show large chakra when active, hide when idle
  useEffect(() => {
    if (status === "thinking" || status === "speaking") {
      const chakraState: "speaking" | "processing" = status === "speaking" ? "speaking" : "processing";
      invoke("show_presence");
      emit("presence-state", { state: chakraState });
    } else if (status === "idle" && !pendingConfirmationRef.current) {
      invoke("hide_presence");
    }
  }, [status]);

  // Presence overlay from VAD: show when user is speaking, hide when idle
  useEffect(() => {
    const unlisten = listen<{ speaking: boolean }>("vad-user-speaking", (event) => {
      if (event.payload.speaking) {
        invoke("show_presence");
        emit("presence-state", { state: "listening" });
      } else if (status === "idle") {
        invoke("hide_presence");
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [status]);

  return (
      <KrishnaContext.Provider
        value={{
          enabled, setKrishnaEnabled,
          status, lastSpoken,
          processCommand, stopSpeaking,
          pendingCommand,
          lastError, clearLastError,
          voice, setVoice,
          rate, setRate,
          llmFallbackEnabled, setLlmFallbackEnabled: setLlmFallback,
          ttsProvider, setTtsProvider,
          elApiKey, setElApiKey,
          elVoiceId, setElVoiceId,
          elVoiceName, setElVoiceName,
          elModelId, setElModelId,
          conversationHistory,
          setConversationHistory,
          clearActiveConversation,
          wakeWordEnabled, setWakeWordEnabled,
          wakeWord, setWakeWord,
          attachedFiles,
          addFile,
          removeFile,
          clearFiles,
          captureScreenshot,
          isScreenshotLoading,
        }}
      >
      {children}
    </KrishnaContext.Provider>
  );
}

export function useKrishnaContext() {
  const ctx = useContext(KrishnaContext);
  if (!ctx) {
    throw new Error("useKrishnaContext must be used within a KrishnaProvider");
  }
  return ctx;
}