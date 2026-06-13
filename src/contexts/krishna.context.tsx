import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { useApp } from "@/contexts";
import { fetchAIResponse } from "@/lib/functions";
import { detectWakeWord } from "@/lib/wake-word";
import { parseActions, executeAction } from "@/lib/actions";
import { executePlan, resolvePlaceholders } from "@/lib/executor";
import { getToolDescriptions } from "@/lib/tools";
import { getTTS } from "@/lib/tts";
import { safeLocalStorage } from "@/lib";
import { STORAGE_KEYS } from "@/config";
import { setKrishnaSpeaking } from "@/lib/krishna-mutex";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { parseYesNo } from "@/lib/parse-yes-no";
import { saveAndConfirm } from "@/lib/resolver";
import { getAllSkills, getSkillByName, createSkill, updateSkillUseCount } from "@/lib/database/skills.action";
import { getAllMemories, createMemory } from "@/lib/database/memories.action";
import type { AssistantStatus, StepAction } from "@/types/assistant";
import type { Skill } from "@/types/skill";
import type { Message } from "@/types";

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
  '    { "tool": "youtube_search", "args": { "query": "song name" }, "out": "url" },',
  '    { "tool": "open_target", "args": { "target": "${url}" } }',
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

// ---- Memory prompt builder ----

async function buildSystemPromptWithMemories(basePrompt: string): Promise<string> {
  try {
    const memories = await getAllMemories();
    if (memories.length === 0) return basePrompt;
    const memoryBlock = memories
      .filter(m => m.confirmed && m.value)
      .map(m => "- " + (m.key ? m.key + ": " : "") + m.value)
      .join("\n");
    if (!memoryBlock) return basePrompt;
    return basePrompt + "\n\nThings I know about the user:\n" + memoryBlock + "\n\nUse these facts when relevant.";
  } catch {
    return basePrompt;
  }
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
  const historyRef = useRef<Message[]>([]);

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
    type: "action" | "plan" | "memory";
    spokenResponse: string;
    pendingResult?: { found: boolean; target?: string; displayName?: string; [key: string]: any };
    input?: string;
    steps?: StepAction[];
    memoryData?: { key: string | null; value: string };
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
          } else if (pending.type === "memory" && pending.memoryData) {
            setStatus("thinking");
            try {
              const now = Date.now();
              await createMemory({
                id: String(now),
                key: pending.memoryData.key || null,
                value: pending.memoryData.value,
                source: "explicit",
                confirmed: 1,
                createdAt: now,
                lastUsedAt: null,
              });
              const speak = "Got it, I'll remember that " + pending.memoryData.value;
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

      // Skill match: check if the command matches a learned skill (pattern-based)
      try {
        const skills = await getAllSkills();
        for (const skill of skills) {
          const vars = matchSkillPattern(command, skill);
          if (vars !== null) {
            setStatus("thinking");
            try {
              const rawSteps: StepAction[] = JSON.parse(skill.planTemplate);
              const steps: StepAction[] = rawSteps.map(step => ({
                ...step,
                args: Object.fromEntries(
                  Object.entries(step.args).map(([k, v]) => [k, resolvePlaceholders(v, vars)])
                ),
              }));
              const result = await executePlan(steps);
              await updateSkillUseCount(skill.id);
              if (result.success) {
                const msg = result.finalOutput || "Done!";
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
              // invalid plan template, fall through to LLM
            } finally {
              setStatus("idle");
            }
            return;
          }
        }
      } catch {
        // DB unavailable, fall through to LLM
      }

      // Memory save: "remember that..."
      const rememberRegex = /^remember that(?:\s+my)?\s+(.+?)\s+is\s+(.+)$/i;
      const rememberMatch = command.match(rememberRegex);
      if (rememberMatch) {
        const key = rememberMatch[1].trim();
        const value = rememberMatch[2].trim();
        if (value) {
          pendingConfirmationRef.current = {
            type: "memory",
            spokenResponse: "Should I remember that " + (key ? key + " is " : "") + value + "?",
            memoryData: { key, value },
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
      }

      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      try {
        historyRef.current = [...historyRef.current, { role: "user" as const, content: command }].slice(-8);
        const systemPrompt = await buildSystemPromptWithMemories(KRISHNA_SYSTEM_PROMPT);
        let fullResponse = "";
        for await (const chunk of fetchAIResponse({
          provider,
          selectedProvider: selectedAIProvider,
          systemPrompt,
          history: historyRef.current,
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
        historyRef.current = [...historyRef.current, { role: "assistant" as const, content: fullResponse }].slice(-8);

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