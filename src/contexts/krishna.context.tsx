import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { useApp } from "@/contexts";
import { fetchAIResponse } from "@/lib/functions";
import { detectWakeWord } from "@/lib/wake-word";
import { parseActions, executeAction } from "@/lib/actions";
import { executePlan } from "@/lib/executor";
import { getToolDescriptions } from "@/lib/tools";
import { getTTS } from "@/lib/tts";
import { safeLocalStorage } from "@/lib";
import { STORAGE_KEYS } from "@/config";
import { setKrishnaSpeaking } from "@/lib/krishna-mutex";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { parseYesNo } from "@/lib/parse-yes-no";
import { saveAndConfirm } from "@/lib/resolver";
import type { AssistantStatus, StepAction } from "@/types/assistant";

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
  llmFallbackEnabled: boolean;
  setLlmFallbackEnabled: (v: boolean) => void;
}

const KrishnaContext = createContext<KrishnaContextType | undefined>(undefined);

const TOOL_DESCRIPTIONS = getToolDescriptions();

const KRISHNA_SYSTEM_PROMPT = [
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
  'MULTI-STEP TASK PLANNING (Phase 4):',
  'For complex requests like "play this song on YouTube", you can output a multi-step plan instead of a single action.',
  'Use the ```plan JSON block:',
  '',
  '```plan',
  '{',
  '  "say": "I\'ll search YouTube for the song and play it.",',
  '  "needsConfirmation": true,',
  '  "plan": [',
  '    { "tool": "youtube_search", "args": { "query": "song name" }, "out": "videoId" },',
  '    { "tool": "open_target", "args": { "target": "https://youtube.com/watch?v=" + "${videoId}&autoplay=1" } }',
  '  ]',
  '}',
  '```',
  '',
  'Available tools:',
].join("\n") + "\n" + TOOL_DESCRIPTIONS + "\n\n" + [
  'Rules:',
  '1. PREFER deep-links (Tier 1) over multi-step plans when possible. A simple open_target with a composed URL is most reliable.',
  '2. Use multi-step plans only when you need intermediate data (e.g., a search result ID).',
  '3. Always set "needsConfirmation": true for multi-step plans.',
  '4. Use ${variable} placeholders to pass outputs between steps.',
  '5. For "play X on YouTube", prefer composing the URL directly: open_target with "https://www.youtube.com/results?search_query=<query>"',
].join("\n");

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

  const pendingConfirmationRef = useRef<{
    type: "action" | "plan";
    spokenResponse: string;
    pendingResult?: { found: boolean; target?: string; displayName?: string; [key: string]: any };
    input?: string;
    steps?: StepAction[];
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
      if (!selectedAIProvider.provider) return null;
      if (!llmFallbackEnabled) return null;
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
    async (transcription: string) => {
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
              const result = await executePlan(pending.steps);
              if (result.success) {
                const successMsg = result.finalOutput || "Plan completed successfully.";
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
              const speak = "Opening " + pending.pendingResult.displayName;
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

        const { spokenText, actions, plan } = parseActions(fullResponse);

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

        // Handle plan (multi-step)
        if (plan && plan.steps.length > 0) {
          pendingConfirmationRef.current = {
            type: "plan",
            spokenResponse: plan.say,
            steps: plan.steps,
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
            if (isStatus) {
              setStatus("speaking");
              setLastSpoken(result.spokenResponse);
              setKrishnaSpeaking(true);
              try {
                await ttsRef.current.speak(result.spokenResponse);
              } finally {
                setKrishnaSpeaking(false);
              }
            }
          }
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
          await ttsRef.current.speak("I had trouble: " + msg);
        } finally {
          setKrishnaSpeaking(false);
        }
      } finally {
        if (!pendingConfirmationRef.current) {
          setStatus("idle");
        }
      }
    },
    [selectedAIProvider, allAiProviders, llmFallback]
  );

  return (
      <KrishnaContext.Provider
        value={{
          enabled, setKrishnaEnabled,
          status, lastSpoken,
          processCommand, stopSpeaking,
          voice, setVoice,
          rate, setRate,
          llmFallbackEnabled, setLlmFallbackEnabled: setLlmFallback,
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