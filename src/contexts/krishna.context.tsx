import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { useApp } from "@/contexts";
import { fetchAIResponse } from "@/lib/functions";
import { detectWakeWord } from "@/lib/wake-word";
import { parseActions, executeAction } from "@/lib/actions";
import { getTTS } from "@/lib/tts";
import { safeLocalStorage } from "@/lib";
import { STORAGE_KEYS } from "@/config";
import { setKrishnaSpeaking } from "@/lib/krishna-mutex";
import { listen } from "@tauri-apps/api/event";
import type { AssistantStatus } from "@/types/assistant";

interface KrishnaContextType {
  enabled: boolean;
  setKrishnaEnabled: (v: boolean) => void;
  status: AssistantStatus;
  lastSpoken: string;
  processCommand: (transcription: string) => Promise<void>;
  stopSpeaking: () => void;
  voice: string;
  setVoice: (name: string) => void;
  rate: number;
  setRate: (v: number) => void;
}

const KrishnaContext = createContext<KrishnaContextType | undefined>(undefined);

const KRISHNA_SYSTEM_PROMPT = `You are Krishna, an AI desktop assistant. You help users by answering questions and performing actions on their computer.

CRITICAL - Action Protocol:
- If the user asks you to open an app, website, or file, respond naturally AND append a JSON action block:
\`\`\`action
{"action":"open","target":"<app_name_or_url>"}
\`\`\`
- The JSON block will NOT be read aloud — it is only used to trigger the action.
- Speak naturally in the spoken part. Keep responses concise.
- Supported apps: notepad, chrome, edge, vscode, calculator, explorer, cmd, powershell, spotify
- For URLs, just use the URL as target (e.g., "https://youtube.com").
- For unknown apps, just say you couldn't find it and do NOT output an action block.`;

export function KrishnaProvider({ children }: { children: ReactNode }) {
  const { selectedAIProvider, allAiProviders } = useApp();
  const ttsRef = useRef(getTTS());

  const [enabled, setEnabled] = useState<boolean>(() => {
    return safeLocalStorage.getItem(STORAGE_KEYS.KRISHNA_ENABLED) === "true";
  });
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [lastSpoken, setLastSpoken] = useState<string>("");
  const [voice, setVoiceState] = useState<string>(() => {
    return safeLocalStorage.getItem(STORAGE_KEYS.KRISHNA_VOICE) || "";
  });
  const [rate, setRateState] = useState<number>(() => {
    const stored = safeLocalStorage.getItem(STORAGE_KEYS.KRISHNA_RATE);
    return stored ? parseFloat(stored) : 1.0;
  });
  const abortRef = useRef<AbortController | null>(null);

  // Initialize natural voice on first mount
  const voiceInitRef = useRef(false);
  useEffect(() => {
    if (voiceInitRef.current) return;
    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      // If user has a saved voice preference, use it
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
    return () => { unlisten?.(); };
  }, []);

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

  const stopSpeaking = useCallback(() => {
    ttsRef.current.stop();
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus("idle");
    setKrishnaSpeaking(false);
  }, []);

  const processCommand = useCallback(
    async (transcription: string) => {
      const wakeResult = detectWakeWord(transcription);
      if (!wakeResult.detected) return;

      setStatus("thinking");

      const command = wakeResult.remainder || "hello";

      if (!selectedAIProvider.provider) {
        setStatus("idle");
        return;
      }

      const provider = allAiProviders.find(
        (p) => p.id === selectedAIProvider.provider
      );
      if (!provider) {
        setStatus("idle");
        return;
      }

      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      try {
        let fullResponse = "";
        for await (const chunk of fetchAIResponse({
          provider,
          selectedProvider: selectedAIProvider,
          systemPrompt: KRISHNA_SYSTEM_PROMPT,
          history: [],
          userMessage: command,
          imagesBase64: [],
          signal,
        })) {
          if (signal.aborted) break;
          fullResponse += chunk;
        }

        if (!fullResponse || signal.aborted) {
          setStatus("idle");
          return;
        }

        const { spokenText, actions } = parseActions(fullResponse);

        if (spokenText) {
          setStatus("speaking");
          setLastSpoken(spokenText);
          setKrishnaSpeaking(true);
          try {
            await ttsRef.current.speak(spokenText);
          } finally {
            setKrishnaSpeaking(false);
          }
        }

        for (const action of actions) {
          await executeAction(action);
        }
      } catch (err) {
        if (signal.aborted) {
          setStatus("idle");
          return;
        }
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setStatus("speaking");
        setKrishnaSpeaking(true);
        try {
          await ttsRef.current.speak(`I had trouble: ${msg}`);
        } finally {
          setKrishnaSpeaking(false);
        }
      } finally {
        setStatus("idle");
      }
    },
    [selectedAIProvider, allAiProviders]
  );

  return (
    <KrishnaContext.Provider
      value={{
        enabled, setKrishnaEnabled,
        status, lastSpoken,
        processCommand, stopSpeaking,
        voice, setVoice,
        rate, setRate,
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
