import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { useApp } from "@/contexts";
import { useMcpTools, useDevicePresence } from "@/hooks";
import { fetchAIResponse } from "@/lib/repo-bound";
import { getRepo } from "@/lib/repo-selector";
import { parseActions, executeAction } from "@/lib/actions";
import { executePlan, resolvePlaceholders } from "@/lib/executor";
import { getAllTools } from "@/lib/tools";
import { selectTools } from "@krishna/core/tool-selector";
import { getTTS, getElevenLabsTTS, getPiperTTS, type TTSProvider } from "@/lib/tts";
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
import { parseRememberCommand, buildMemoryPrompt } from "@/lib/memory";
import { detectWakeWord } from "@/lib/wake-word";
import { parseReminderCommand } from "@/lib/reminders";
import { createReminder, getDueReminders, updateReminder, cancelReminder } from "@/lib/repo-bound";
import { createConversation, appendMessages, generateConversationTitle, getMostRecentConversation, deleteConversation } from "@/lib/repo-bound";
import { isLookCommand, isUndoCommand, isJobExtractionCommand } from "@/lib/perception";
import { triggerJobExtractionWorkflow } from "@/lib/integrations/github-workflow";
import { createAuditEntry, getLastReversible, logCommand } from "@/lib/database";
import type { CommandOutcome, FailureReason } from "@/lib/database";
import { setConfirmAction } from "@krishna/core/tools/mcp-bridge";
import type { AssistantStatus, StepAction } from "@/types/assistant";
import type { Skill } from "@/types/skill";
import type { Message, AttachedFile } from "@/types";
import { MAX_FILES } from "@/config";

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
  processCommand: (transcription: string, opts?: { skipWakeWord?: boolean }) => Promise<void>;
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

const BASE_SYSTEM_PROMPT = [
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
    transcript: string,
    outcome: CommandOutcome,
    failureReason?: FailureReason,
    detail?: string,
    response?: string,
    source: "voice" | "text" | "mobile" = "voice",
  ) => {
    logCommand({ id: crypto.randomUUID(), transcript, outcome, failureReason, detail, response, source, createdAt: Date.now() })
      .catch((err) => console.error("Failed to log command outcome:", err));
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
      const allVoices = window.speechSynthesis.getVoices();
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
    window.speechSynthesis.onvoiceschanged = loadVoices;
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
            await ttsRef.current.speak(speak);
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
        };
        reAskRef.current = false;
        clearConfirmTimeout();
        confirmTimeoutRef.current = setTimeout(() => {
          if (pendingConfirmationRef.current?.type === "mcp_tool") {
            pendingConfirmationRef.current.resolve?.(false);
            pendingConfirmationRef.current = null;
            setStatus("idle");
            ttsRef.current.speak("I'll take that as a no.");
          }
        }, 15000);
        setKrishnaSpeaking(true);
        setStatus("confirming");
        setLastSpoken(msg);
        ttsRef.current.speak(msg).finally(() => setKrishnaSpeaking(false));
      });
    });
    return () => setConfirmAction(null);
  }, []);

  const pendingConfirmationRef = useRef<{
    type: "action" | "plan" | "memory" | "reminder" | "job_extraction" | "mcp_tool";
    spokenResponse: string;
    pendingResult?: { found: boolean; target?: string; displayName?: string; [key: string]: any };
    input?: string;
    steps?: StepAction[];
    memoryData?: { key: string | null; value: string };
    reminderData?: { text: string; dueAt: number; recurrence: string | null };
    resolve?: (value: boolean) => void;
  } | null>(null);
  const reAskRef = useRef(false);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearConfirmTimeout = useCallback(() => {
    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
  }, []);

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

  const promptMemoryConfirmation = useCallback(async (key: string | null, value: string, inputText: string) => {
    pendingConfirmationRef.current = {
      type: "memory",
      spokenResponse: "Should I remember that " + (key ? key + " is " : "") + value + "?",
      memoryData: { key, value },
      input: inputText,
    };
    reAskRef.current = false;
    clearConfirmTimeout();
    confirmTimeoutRef.current = setTimeout(() => {
      pendingConfirmationRef.current = null;
      reAskRef.current = false;
      setStatus("idle");
      ttsRef.current.speak("I'll forget about it.");
    }, 15000);
    setStatus("confirming");
    setLastSpoken(pendingConfirmationRef.current.spokenResponse);
    setKrishnaSpeaking(true);
    try {
      await ttsRef.current.speak(pendingConfirmationRef.current.spokenResponse);
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
    const allVoices = window.speechSynthesis.getVoices();
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
      if (getRepo().mode === "remote") return null;
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
    async (transcription: string, opts?: { skipWakeWord?: boolean }) => {
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
                setLastSpoken(successMsg);
                setKrishnaSpeaking(true);
                setStatus("speaking");
                try {
                  await ttsRef.current.speak(successMsg);
                } finally {
                  setKrishnaSpeaking(false);
                }
              } else {
                const errorMsg = result.error || "Plan execution failed.";
                await recordTurn(pending.input || "", errorMsg);
                setLastSpoken(errorMsg);
                setKrishnaSpeaking(true);
                setStatus("speaking");
                try {
                  await ttsRef.current.speak(errorMsg);
                } finally {
                  setKrishnaSpeaking(false);
                }
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Plan execution failed";
              await recordTurn(pending.input || "", "I had trouble: " + msg);
              setStatus("speaking");
              setKrishnaSpeaking(true);
              try {
                await ttsRef.current.speak("I had trouble: " + msg);
              } finally {
                setKrishnaSpeaking(false);
              }
            } finally {
              setStatus("idle");
            }
          } else if (pending.type === "memory" && pending.memoryData) {
            setStatus("thinking");
            try {
              const now = Date.now();
              const memoryId = String(now);
              await createMemory({
                id: memoryId,
                key: pending.memoryData.key || null,
                value: pending.memoryData.value,
                source: "explicit",
                confirmed: 1,
                createdAt: now,
                lastUsedAt: null,
              });
              try {
                await createAuditEntry({
                  id: String(Date.now()),
                  actionType: "memory_write",
                  summary: "Remembered " + pending.memoryData.value,
                  result: "ok",
                  reversible: 1,
                  undoPayload: JSON.stringify({ kind: "memory", id: memoryId }),
                  createdAt: Date.now(),
                });
              } catch { /* non-critical */ }
              const speak = "Got it, I'll remember that " + pending.memoryData.value;
              await recordTurn(pending.input || "", speak);
              setLastSpoken(speak);
              setKrishnaSpeaking(true);
              setStatus("speaking");
              try {
                await ttsRef.current.speak(speak);
              } finally {
                setKrishnaSpeaking(false);
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Failed to save memory";
              await recordTurn(pending.input || "", "I had trouble: " + msg);
              setStatus("speaking");
              setKrishnaSpeaking(true);
              try {
                await ttsRef.current.speak("I had trouble: " + msg);
              } finally {
                setKrishnaSpeaking(false);
              }
            } finally {
              setStatus("idle");
            }
          } else if (pending.type === "mcp_tool" && pending.resolve) {
            pending.resolve(true);
            setStatus("thinking");
            return;
          } else if (pending.type === "job_extraction") {
            setStatus("thinking");
            try {
              const result = await triggerJobExtractionWorkflow();
              const speak = result.success
                ? "Started your daily job extraction. You'll get the email report shortly."
                : "I couldn't start it: " + (result.error || "unknown error");
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
                await ttsRef.current.speak(speak);
              } finally {
                setKrishnaSpeaking(false);
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Failed to trigger job extraction";
              logOutcome(pending.input ?? "", "failed", "tool_failed", msg);
              await recordTurn(pending.input || "", "I had trouble: " + msg);
              setStatus("speaking");
              setKrishnaSpeaking(true);
              try {
                await ttsRef.current.speak("I had trouble: " + msg);
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
              await recordTurn(pending.input || "", speak);
              setLastSpoken(speak);
              setKrishnaSpeaking(true);
              setStatus("speaking");
              try {
                await ttsRef.current.speak(speak);
              } finally {
                setKrishnaSpeaking(false);
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Failed to set reminder";
              logOutcome(pending.input ?? "", "failed", "tool_failed", msg);
              await recordTurn(pending.input || "", "I had trouble: " + msg);
              setStatus("speaking");
              setKrishnaSpeaking(true);
              try {
                await ttsRef.current.speak("I had trouble: " + msg);
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
              await recordTurn(pending.input || "", speak);
              setLastSpoken(speak);
              setKrishnaSpeaking(true);
              await ttsRef.current.speak(speak);
            } finally {
              setKrishnaSpeaking(false);
              setStatus("idle");
            }
          }
          return;
        }
        if (answer === "no") {
          if (pending.type === "mcp_tool" && pending.resolve) {
            pending.resolve(false);
          }
          logOutcome(pending.input ?? "", "declined", "user_declined");
          pendingConfirmationRef.current = null;
          reAskRef.current = false;
          setStatus("speaking");
          try {
            const speak = "Okay, I won't do that.";
            setLastSpoken(speak);
            setKrishnaSpeaking(true);
            await ttsRef.current.speak(speak);
          } finally {
            setKrishnaSpeaking(false);
            setStatus("idle");
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
            await ttsRef.current.speak(speak);
          } finally {
            setKrishnaSpeaking(false);
          }
          return;
        }
        pendingConfirmationRef.current = null;
        reAskRef.current = false;
        setStatus("idle");
        return;
      }

      let command = transcription.trim() || "hello";

      if (wakeWordEnabled && !opts?.skipWakeWord && !pendingConfirmationRef.current) {
        const { detected, remainder } = detectWakeWord(transcription, wakeWord);
        if (!detected) {
          setStatus("idle");
          logOutcome(transcription, "ignored", "wake_word_missed");
          return;
        }
        command = remainder || command;
      }

      pendingUserTextRef.current = command;
      setLastError(null);
      setPendingCommand(command);
      setStatus("thinking");

      let provider;
      if (getRepo().mode === "remote") {
        provider = undefined;
      } else {
        if (!selectedAIProvider.provider) {
          const errMsg = "No AI provider configured — open Settings › Brain.";
          setLastError(errMsg);
          setStatus("idle");
          logOutcome(command, "failed", "no_ai_provider", errMsg);
          return;
        }
        provider = allAiProviders.find(
          (p) => p.id === selectedAIProvider.provider
        );
        if (!provider) {
          const errMsg = "AI provider not found — check Settings › Brain.";
          setLastError(errMsg);
          setStatus("idle");
          logOutcome(command, "failed", "ai_error", errMsg);
          return;
        }
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
            if (hasSensitiveStep) {
              pendingConfirmationRef.current = {
                type: "plan",
                spokenResponse: "Should I run the skill \"" + skill.name + "\"?",
                steps,
                input: command,
              };
              reAskRef.current = false;
              clearConfirmTimeout();
              confirmTimeoutRef.current = setTimeout(() => {
                pendingConfirmationRef.current = null;
                reAskRef.current = false;
                setStatus("idle");
                ttsRef.current.speak("I'll take that as a no.");
              }, 15000);
              setStatus("confirming");
              setLastSpoken("Should I run the skill \"" + skill.name + "\"?");
              setKrishnaSpeaking(true);
              try {
                await ttsRef.current.speak("Should I run the skill \"" + skill.name + "\"?");
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
                  await ttsRef.current.speak(msg);
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
                  await ttsRef.current.speak(msg);
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

      // Job extraction: "run my daily job extraction"
      if (isJobExtractionCommand(command)) {
        pendingConfirmationRef.current = {
          type: "job_extraction",
          spokenResponse: "Should I run your daily job extraction now?",
          input: command,
        };
        reAskRef.current = false;
        clearConfirmTimeout();
        confirmTimeoutRef.current = setTimeout(() => {
          pendingConfirmationRef.current = null;
          reAskRef.current = false;
          setStatus("idle");
          ttsRef.current.speak("Okay, I won't run it.");
        }, 15000);
        setStatus("confirming");
        setLastSpoken(pendingConfirmationRef.current.spokenResponse);
        setKrishnaSpeaking(true);
        try {
          await ttsRef.current.speak(pendingConfirmationRef.current.spokenResponse);
        } finally {
          setKrishnaSpeaking(false);
        }
        return;
      }

      // Reminder: "remind me..."
      const reminderResult = parseReminderCommand(command);
      if (reminderResult) {
        pendingConfirmationRef.current = {
          type: "reminder",
          spokenResponse: "Should I remind you to " + reminderResult.text + "?",
          reminderData: reminderResult,
          input: command,
        };
        reAskRef.current = false;
        clearConfirmTimeout();
        confirmTimeoutRef.current = setTimeout(() => {
          pendingConfirmationRef.current = null;
          reAskRef.current = false;
          setStatus("idle");
          ttsRef.current.speak("I'll forget about it.");
        }, 15000);
        setStatus("confirming");
        setLastSpoken(pendingConfirmationRef.current.spokenResponse);
        setKrishnaSpeaking(true);
        try {
          await ttsRef.current.speak(pendingConfirmationRef.current.spokenResponse);
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
            await ttsRef.current.speak(speak);
          } finally {
            setKrishnaSpeaking(false);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to capture screen";
          await recordTurn(pendingUserTextRef.current, "I had trouble looking at your screen: " + msg);
          setStatus("speaking");
          setKrishnaSpeaking(true);
          try {
            await ttsRef.current.speak("I had trouble looking at your screen: " + msg);
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
                await ttsRef.current.speak("There's nothing to undo.");
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
              await ttsRef.current.speak(speak);
            } finally {
              setKrishnaSpeaking(false);
            }
          } catch {
            await recordTurn(pendingUserTextRef.current, "I had trouble undoing that.");
            setStatus("speaking");
            setKrishnaSpeaking(true);
            try {
              await ttsRef.current.speak("I had trouble undoing that.");
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

      try {
        historyRef.current = [...historyRef.current, { role: "user" as const, content: command }].slice(-8);
        const memories = await getAllMemories();
        const now = new Date();
        const timeContext = `\n\nCurrent date and time: ${now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })} IST`;
        const toolsSection = buildToolsSection(command);
        const personaPrefix = selectedSystemPrompt && selectedSystemPrompt !== DEFAULT_SYSTEM_PROMPT
          ? selectedSystemPrompt + "\n\n"
          : "";
        const systemPrompt = buildMemoryPrompt(personaPrefix + BASE_SYSTEM_PROMPT + "\n\n" + toolsSection + SYSTEM_PROMPT_RULES + timeContext, memories);
        let fullResponse = "";
        for await (const chunk of fetchAIResponse({
          provider,
          selectedProvider: selectedAIProvider,
          systemPrompt,
          history: historyRef.current,
          userMessage: command,
          imagesBase64: attachedFilesRef.current.map(f => f.base64),
          signal,
        })) {
          if (signal.aborted) break;
          fullResponse += chunk;
        }

        if (!fullResponse || signal.aborted) {
          setStatus("idle");
          return;
        }

        const { spokenText, actions, plan } = parseActions(fullResponse);
        historyRef.current = [...historyRef.current, { role: "assistant" as const, content: fullResponse }].slice(-8);
        let spokenTextRecorded = false;

        if (spokenText) {
          await recordTurn(pendingUserTextRef.current, spokenText);
          logOutcome(command, "answered", undefined, undefined, spokenText);
          spokenTextRecorded = true;
          setStatus("speaking");
          setLastSpoken(spokenText);
          setKrishnaSpeaking(true);
          try {
            await ttsRef.current.speak(spokenText);
          } finally {
            setKrishnaSpeaking(false);
          }
        }

        // Handle plan (multi-step)
        if (plan && plan.steps.length > 0) {
          pendingConfirmationRef.current = {
            type: "plan",
            spokenResponse: plan.say,
            steps: plan.steps,
            input: command,
          };
          reAskRef.current = false;
          clearConfirmTimeout();
          confirmTimeoutRef.current = setTimeout(() => {
            pendingConfirmationRef.current = null;
            reAskRef.current = false;
            setStatus("idle");
            ttsRef.current.speak("I'll take that as a no.");
          }, 15000);
          setStatus("confirming");
          setLastSpoken(plan.say);
          setKrishnaSpeaking(true);
          try {
            await ttsRef.current.speak(plan.say);
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
          const result = await executeAction(action, llmFallback);
          if (result.needsConfirmation && result.pendingResult) {
            pendingConfirmationRef.current = {
              type: "action",
              spokenResponse: result.spokenResponse,
              pendingResult: result.pendingResult as any,
              input: result.input,
            };
            reAskRef.current = false;
            clearConfirmTimeout();
            confirmTimeoutRef.current = setTimeout(() => {
              pendingConfirmationRef.current = null;
              reAskRef.current = false;
              setStatus("idle");
              ttsRef.current.speak("I'll take that as a no.");
            }, 15000);
            setStatus("confirming");
            setLastSpoken(result.spokenResponse);
            setKrishnaSpeaking(true);
            try {
              await ttsRef.current.speak(result.spokenResponse);
            } finally {
              setKrishnaSpeaking(false);
            }
            return;
          }
            if (result.spokenResponse) {
              const isStatus = result.spokenResponse.startsWith("Opening") || result.spokenResponse.startsWith("Failed");
              if (isStatus && !spokenTextRecorded) {
                await recordTurn(pendingUserTextRef.current, result.spokenResponse);
                // A "Failed…" status is a tool failure, not an answer — capture it as such
                // so it shows up in command insights instead of inflating the success count.
                const toolFailed = result.spokenResponse.startsWith("Failed");
                logOutcome(
                  command,
                  toolFailed ? "failed" : "answered",
                  toolFailed ? "tool_failed" : undefined,
                  toolFailed ? result.spokenResponse : undefined,
                  result.spokenResponse,
                );
                setStatus("speaking");
                setLastSpoken(result.spokenResponse);
                setKrishnaSpeaking(true);
                try {
                  await ttsRef.current.speak(result.spokenResponse);
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
        if (signal.aborted) {
          setStatus("idle");
          return;
        }
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setLastError(msg);
        logOutcome(command, "failed", "ai_error", msg);
        setStatus("speaking");
        setKrishnaSpeaking(true);
        try {
          await ttsRef.current.speak("I had trouble: " + msg);
        } finally {
          setKrishnaSpeaking(false);
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