import { useState, useRef, useCallback } from "react";
import { useKrishna } from "./useKrishna";

interface UseMobileSpeechReturn {
  isListening: boolean;
  isSupported: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  supported: boolean;
}

type SpeechRecognitionAPI = any;

function getSpeechRecognition(): SpeechRecognitionAPI | null {
  if (typeof window === "undefined") return null;
  const api =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null;
  return api || null;
}

/**
 * Hook that wraps the Web Speech API for push-to-talk speech recognition.
 * Works on Android Chrome WebView and iOS Safari.
 * Falls back gracefully if the API is unavailable.
 */
export function useMobileSpeech(): UseMobileSpeechReturn {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef("");
  const krishna = useKrishna();

  const SpeechRecognitionAPI = getSpeechRecognition();
  const isSupported = SpeechRecognitionAPI !== null;

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      setError("Speech recognition not supported on this device");
      return;
    }

    setError(null);
    finalTranscriptRef.current = "";

    const recognition: any = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += event.results[i][0].transcript;
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(`Speech error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      const transcript = finalTranscriptRef.current.trim();
      if (transcript) {
        krishna.processCommand(transcript);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [SpeechRecognitionAPI, krishna]);

  const supported = isSupported;

  return {
    isListening,
    isSupported,
    error,
    startListening,
    stopListening,
    supported,
  };
}
