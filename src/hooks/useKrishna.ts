import { useState, useCallback, useRef } from "react";
import { useApp } from "@/contexts";
import { fetchAIResponse } from "@/lib/functions";
import { detectWakeWord } from "@/lib/wake-word";
import { parseActions, executeAction } from "@/lib/actions";
import { getTTS } from "@/lib/tts";
import { safeLocalStorage } from "@/lib";
import { STORAGE_KEYS } from "@/config";
import type { AssistantStatus } from "@/types/assistant";

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

export function useKrishna() {
  const {
    selectedAIProvider,
    allAiProviders,
  } = useApp();

  const [enabled, setEnabled] = useState<boolean>(() => {
    return safeLocalStorage.getItem(STORAGE_KEYS.KRISHNA_ENABLED) === "true";
  });
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const [lastSpoken, setLastSpoken] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const ttsRef = useRef(getTTS());

  const setKrishnaEnabled = useCallback((value: boolean) => {
    setEnabled(value);
    safeLocalStorage.setItem(STORAGE_KEYS.KRISHNA_ENABLED, String(value));
  }, []);

  const stopSpeaking = useCallback(() => {
    ttsRef.current.stop();
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStatus("idle");
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

      try {
        let fullResponse = "";
        for await (const chunk of fetchAIResponse({
          provider,
          selectedProvider: selectedAIProvider,
          systemPrompt: KRISHNA_SYSTEM_PROMPT,
          history: [],
          userMessage: command,
          imagesBase64: [],
        })) {
          if (abortRef.current?.signal.aborted) break;
          fullResponse += chunk;
        }

        if (!fullResponse || abortRef.current?.signal.aborted) {
          setStatus("idle");
          return;
        }

        const { spokenText, actions } = parseActions(fullResponse);

        if (spokenText) {
          setStatus("speaking");
          setLastSpoken(spokenText);
          await ttsRef.current.speak(spokenText);
        }

        for (const action of actions) {
          await executeAction(action);
        }
      } catch {
        // Silently handle errors
      } finally {
        setStatus("idle");
      }
    },
    [selectedAIProvider, allAiProviders]
  );

  return {
    enabled,
    setKrishnaEnabled,
    status,
    lastSpoken,
    processCommand,
    stopSpeaking,
  };
}
