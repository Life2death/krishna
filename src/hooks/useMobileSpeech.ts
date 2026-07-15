import { useState, useRef, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useKrishna } from "./useKrishna";
import { detectWakeWord } from "@/lib/wake-word";
import { getTTS } from "@/lib/tts";

const HANDS_FREE_STORAGE_KEY = "krishna_mobile_hands_free";

interface UseMobileSpeechReturn {
  isListening: boolean;
  isSupported: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  supported: boolean;
  handsFree: boolean;
  setHandsFree: (on: boolean) => void;
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

/** "go hands free (mode)" / "hands free mode on" → true; "exit/stop/turn off hands free" → false */
function matchHandsFreeToggle(text: string): boolean | null {
  const t = text.toLowerCase();
  if (!/hands?[- ]?free/.test(t)) return null;
  if (/\b(exit|stop|end|disable|turn off|switch off|cancel)\b/.test(t)) return false;
  if (/\b(go|enter|start|enable|turn on|switch on|activate|mode)\b/.test(t)) return true;
  return null;
}

/**
 * Push-to-talk + hands-free speech recognition for mobile.
 *
 * Tap mode: tap → listen → tap/pause → the transcript runs as a command
 * (skipWakeWord — the tap itself is the wake signal).
 *
 * Hands-free mode: recognition restarts continuously while Krishna is idle and
 * ONLY wake-word-prefixed utterances run ("hey krishna, zoom in"). Voice
 * toggles: "go hands free mode" / "exit hands free mode" (work in both modes).
 * Limitation: the mic lives in the app's WebView, so listening pauses while
 * another app is in the foreground or the screen is off.
 *
 * `opts.suppressed` mutes hands-free (and, on Android, stops the native
 * KrishnaHandsFreeService) without touching the user's stored preference —
 * used to hand control to a Live session while it's active. When suppression
 * lifts, hands-free resumes automatically if it was on, instead of the caller
 * having to remember and restore it (a one-way `setHandsFree(false)` would
 * permanently clobber the preference instead of handing control back).
 */
export function useMobileSpeech(opts?: { suppressed?: boolean }): UseMobileSpeechReturn {
  const suppressed = opts?.suppressed ?? false;
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handsFree, setHandsFreeState] = useState<boolean>(
    () => typeof localStorage !== "undefined" && localStorage.getItem(HANDS_FREE_STORAGE_KEY) === "true",
  );
  const effectiveHandsFree = handsFree && !suppressed;
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef("");
  const handsFreeRef = useRef(effectiveHandsFree);
  const krishna = useKrishna();

  const SpeechRecognitionAPI = getSpeechRecognition();
  const isSupported = SpeechRecognitionAPI !== null;
  const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

  const setHandsFree = useCallback((on: boolean) => {
    handsFreeRef.current = on && !suppressed;
    setHandsFreeState(on);
    try {
      localStorage.setItem(HANDS_FREE_STORAGE_KEY, on ? "true" : "false");
    } catch { /* storage unavailable */ }
  }, [suppressed]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  /** Dispatch a finished transcript. handsFreeCapture = came from the ambient loop. */
  const dispatchTranscript = useCallback(
    (transcript: string, handsFreeCapture: boolean) => {
      // Voice toggle works from BOTH modes, wake word optional for it.
      const stripped = detectWakeWord(transcript, krishna.wakeWord);
      const toggle = matchHandsFreeToggle(stripped.detected ? stripped.remainder : transcript);
      if (toggle !== null) {
        setHandsFree(toggle);
        void getTTS().speak(
          toggle
            ? "Hands free mode on. Start with the wake word when you need me."
            : "Hands free mode off.",
        );
        return;
      }

      if (handsFreeCapture) {
        // Ambient audio: ALWAYS require the wake word, regardless of settings —
        // otherwise every nearby conversation becomes a command.
        if (!stripped.detected || !stripped.remainder) return;
        void krishna.processCommand(stripped.remainder, { skipWakeWord: true });
      } else {
        // Deliberate tap: the tap is the wake signal (but strip a spoken wake
        // word if the user said it anyway).
        const command = stripped.detected && stripped.remainder ? stripped.remainder : transcript;
        void krishna.processCommand(command, { skipWakeWord: true });
      }
    },
    [krishna, setHandsFree],
  );

  const startRecognition = useCallback(
    (handsFreeCapture: boolean) => {
      if (!SpeechRecognitionAPI) {
        setError("Speech recognition not supported on this device");
        return;
      }
      if (recognitionRef.current) return; // already listening

      setError(null);
      finalTranscriptRef.current = "";

      const recognition: any = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        // Android's recognizer emits CUMULATIVE final results — replace when
        // the new final extends the old; append only genuinely new segments.
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            const seg = event.results[i][0].transcript;
            const cur = finalTranscriptRef.current;
            if (seg.startsWith(cur) || cur.startsWith(seg)) {
              finalTranscriptRef.current = seg.length >= cur.length ? seg : cur;
            } else {
              finalTranscriptRef.current = cur + seg;
            }
          }
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === "no-speech" || event.error === "aborted") return;
        if (event.error === "not-allowed") {
          // Don't loop forever against a denied mic — drop out of hands-free.
          setHandsFree(false);
          setError("Microphone permission denied");
        } else {
          setError(`Speech error: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        setIsListening(false);
        const transcript = finalTranscriptRef.current.trim();
        if (transcript) {
          dispatchTranscript(transcript, handsFreeCapture);
        } else if (!handsFreeCapture) {
          // Tap mode ending with nothing captured used to be SILENT.
          setError("I didn't catch that — tap and try again");
        }
        // Hands-free restart happens in the effect below (it waits for
        // Krishna to finish speaking so she doesn't hear herself).
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    },
    [SpeechRecognitionAPI, dispatchTranscript, setHandsFree],
  );

  const startListening = useCallback(() => startRecognition(false), [startRecognition]);

  useEffect(() => {
    if (!isAndroid) return;
    let cancelled = false;

    const command = effectiveHandsFree ? "android_hands_free_start" : "android_hands_free_stop";
    void invoke(command)
      .then(() => {
        if (!cancelled) setIsListening(effectiveHandsFree);
      })
      .catch((err) => {
        if (!cancelled && effectiveHandsFree) {
          setIsListening(false);
          setError(`Hands-free service error: ${String(err)}`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveHandsFree, isAndroid]);

  // Hands-free ambient loop: keep recognition alive whenever Krishna is idle.
  // Pausing while she thinks/speaks avoids transcribing her own voice.
  useEffect(() => {
    handsFreeRef.current = effectiveHandsFree;
    if (isAndroid) return;
    if (!effectiveHandsFree || !isSupported) return;
    if (krishna.status !== "idle") return;
    if (recognitionRef.current) return;
    // Small delay so TTS audio has fully stopped before the mic re-opens.
    const t = setTimeout(() => {
      if (handsFreeRef.current && !recognitionRef.current && krishna.status === "idle") {
        startRecognition(true);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [effectiveHandsFree, isAndroid, isSupported, krishna.status, isListening, startRecognition]);

  // Leaving hands-free mid-listen (or being suppressed for a Live session)
  // stops the ambient capture.
  useEffect(() => {
    if (!effectiveHandsFree && recognitionRef.current && !isListening) {
      stopListening();
    }
  }, [effectiveHandsFree, isListening, stopListening]);

  const supported = isSupported;

  return {
    isListening,
    isSupported,
    error,
    startListening,
    stopListening,
    supported,
    handsFree,
    setHandsFree,
  };
}
