import { useCallback, useEffect, useRef, useState } from "react";
import { getTTS } from "@/lib/tts";
import type { AssistantStatus } from "@/types/assistant";

interface UseSpeechOptions {
  onStart?: () => void;
  onEnd?: () => void;
}

export function useSpeech(options: UseSpeechOptions = {}) {
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState<AssistantStatus>("idle");
  const ttsRef = useRef(getTTS());
  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const naturalVoice = voices.find(
        (v) =>
          v.name.includes("Natural") &&
          v.lang.startsWith("en") &&
          v.name.includes("David")
      ) || voices.find(
        (v) =>
          v.name.includes("Natural") &&
          v.lang.startsWith("en")
      ) || voices.find(
        (v) => v.lang.startsWith("en") && v.name.includes("Microsoft")
      );
      if (naturalVoice) {
        preferredVoiceRef.current = naturalVoice;
        ttsRef.current.setVoice(naturalVoice);
      }
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const setVoice = useCallback((voice: SpeechSynthesisVoice | null) => {
    preferredVoiceRef.current = voice;
    ttsRef.current.setVoice(voice);
  }, []);

  const setRate = useCallback((rate: number) => {
    ttsRef.current.setRate(rate);
  }, []);

  const setPitch = useCallback((pitch: number) => {
    ttsRef.current.setPitch(pitch);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      setSpeaking(true);
      setStatus("speaking");
      options.onStart?.();
      try {
        await ttsRef.current.speak(text);
      } finally {
        setSpeaking(false);
        setStatus("idle");
        options.onEnd?.();
      }
    },
    [options]
  );

  const stop = useCallback(() => {
    ttsRef.current.stop();
    setSpeaking(false);
    setStatus("idle");
  }, []);

  return {
    speak,
    stop,
    speaking,
    status,
    setVoice,
    setRate,
    setPitch,
    getVoices: ttsRef.current.getVoices.bind(ttsRef.current),
  };
}
