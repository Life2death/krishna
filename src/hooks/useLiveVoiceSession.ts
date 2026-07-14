import { useCallback, useEffect, useRef, useState } from "react";
import { createRealtimeClient, type IRealtimeClient } from "@/lib/realtime/realtime-provider";
import { secureStorage } from "@/lib/secure-storage";
import { LiveOrchestrator } from "@/lib/realtime/live-orchestrator";
import { getLiveVoiceSettings } from "@/lib/storage/live-voice-settings.storage";
import { LiveTurnLogger } from "@/lib/realtime/live-turn-logger";
import { getAllMemories } from "@/lib/repo-bound";
import { formatMemoriesBlock } from "@/lib/memory";
import { getTTS } from "@/lib/tts";

const HANDOFF_MESSAGE = "Connection issue. Handing over to local Krishna.";

const STORAGE_KEY_REALTIME_KEY = "openai_realtime_api_key";
const STORAGE_KEY_GEMINI_KEY = "gemini_realtime_api_key";

export interface UseLiveVoiceSessionOptions {
  /**
   * Whether Live mode is currently selected. When it flips to false the session
   * is torn down. Defaults to true (desktop mounts this only while in Live mode).
   */
  active?: boolean;
  /**
   * Force auto-start regardless of the persisted `autoStart`/`wakeWordEnabled`
   * settings. The mobile shell passes `true` so switching to a Live endpoint
   * starts the session immediately instead of waiting for a manual tap.
   */
  autoStart?: boolean;
  onSwitchToClassic: () => void;
  onLiveStatus?: (status: string) => void;
  onLiveUserText?: (text: string | null) => void;
  onLiveAssistantText?: (text: string | null) => void;
  onTurnComplete?: () => void;
}

export interface LiveVoiceSession {
  state: string;
  error: string | null;
  duration: string;
  costStr: string;
  transcript: string | null;
  hasApiKey: boolean;
  isActive: boolean;
  isBusy: boolean;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Realtime (OpenAI/Gemini) Live Voice session lifecycle, extracted from
 * LiveVoiceBar so both the desktop bar and the mobile home screen can share one
 * implementation and render their own UI over the same session state.
 */
export function useLiveVoiceSession(opts: UseLiveVoiceSessionOptions): LiveVoiceSession {
  const {
    active = true,
    autoStart,
    onSwitchToClassic,
    onLiveStatus,
    onLiveUserText,
    onLiveAssistantText,
    onTurnComplete,
  } = opts;

  const clientRef = useRef<IRealtimeClient | null>(null);
  const orchestratorRef = useRef<LiveOrchestrator | null>(null);
  const loggerRef = useRef<LiveTurnLogger | null>(null);
  const autoStartedRef = useRef(false);
  const handedOffRef = useRef(false);

  const [state, setState] = useState<string>("idle");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [duration, setDuration] = useState("00:00");
  const [costStr, setCostStr] = useState("$0.00");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    const s = getLiveVoiceSettings();
    const storageKey =
      s.provider === "gemini" ? STORAGE_KEY_GEMINI_KEY : STORAGE_KEY_REALTIME_KEY;
    secureStorage.get(storageKey).then((val) => {
      if (val) {
        setApiKey(val);
        setHasApiKey(true);
      }
    });
  }, []);

  const isActive = state === "connected" || state === "speaking";
  const isBusy = state === "connecting" || state === "disconnecting";

  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startDurationUpdates = useCallback(() => {
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    durationIntervalRef.current = setInterval(() => {
      const client = clientRef.current;
      if (client) {
        setDuration(client.getSessionDurationFormatted());
        setCostStr(client.getEstimatedCost());
      }
    }, 1000);
  }, []);

  const stopDurationUpdates = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const handleStart = useCallback(async () => {
    setError(null);
    setTranscript(null);
    handedOffRef.current = false;

    const settings = getLiveVoiceSettings();
    const storageKey =
      settings.provider === "gemini" ? STORAGE_KEY_GEMINI_KEY : STORAGE_KEY_REALTIME_KEY;
    const key = (await secureStorage.get(storageKey)) || apiKey;
    if (!key) {
      setError(
        `No ${settings.provider === "gemini" ? "Gemini" : "OpenAI"} API key configured`,
      );
      return;
    }

    // Preflight: on some mobile WebViews mic capture is unavailable (non-secure
    // context). Fail with a clear message instead of a cryptic undefined error.
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone unavailable here (WebView needs a secure context).");
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 24000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
      } catch (micErr) {
        const name = micErr instanceof Error ? micErr.name : "";
        setError(
          name === "NotAllowedError"
            ? "Microphone permission denied. Enable it for Krishna in system settings."
            : `Couldn't access microphone: ${micErr instanceof Error ? micErr.message : String(micErr)}`,
        );
        return;
      }

      // Wake-word gating. OpenAI: tell the session not to auto-reply and let the
      // orchestrator release replies on the wake word. Gemini: the client itself
      // suppresses replies to unaddressed speech (via config.wakeWord).
      const wwEnabled = settings.wakeWordEnabled;
      const openaiGate = wwEnabled && settings.provider === "openai";
      const geminiGate = wwEnabled && settings.provider === "gemini";

      const client = createRealtimeClient(settings.provider, {
        voice: settings.voice,
        instructions: "",
        inactivityTimeoutMs: settings.inactivityTimeoutMs,
        maxSessionDurationMs: settings.maxSessionDurationMs,
        language: settings.language,
        ...(settings.provider === "gemini" ? { model: settings.geminiModel } : {}),
        ...(geminiGate ? { wakeWord: settings.wakeWord } : {}),
        ...(openaiGate
          ? {
              turnDetection: {
                type: "server_vad" as const,
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
                create_response: false,
              },
            }
          : {}),
      });
      clientRef.current = client;

      // Load confirmed memories so Live Voice can speak about what the user has
      // stored (best-effort — never block the session on this).
      let memoryBlock = "";
      try {
        memoryBlock = formatMemoriesBlock(await getAllMemories());
      } catch (e) {
        console.error("[LiveVoice] failed to load memories:", e);
      }

      const orchestrator = new LiveOrchestrator(client, {
        settings,
        memoryBlock,
        wakeWord: openaiGate ? settings.wakeWord : undefined,
      });
      orchestratorRef.current = orchestrator;

      const logger = new LiveTurnLogger(client.config.model);
      loggerRef.current = logger;

      client.setCallbacks({
        onStateChange: (s) => {
          setState(s);
          onLiveStatus?.(s);
        },
        onError: (msg) => {
          setError(msg);
        },
        onTranscript: (text, _isFinal) => {
          setTranscript(text);
          logger.handleTranscript(text);
          onLiveAssistantText?.(text);
        },
        onUserTranscript: (text) => {
          orchestrator.handleUserTranscript(text);
          logger.handleUserTranscript(text);
          onLiveUserText?.(text);
        },
        onAudioDelta: () => {
          logger.handleAudioDelta();
        },
        onResponseCreated: () => {
          logger.handleResponseCreated();
        },
        onResponseDone: ({ usage }) => {
          void logger.handleResponseDone(usage).then(() => onTurnComplete?.());
        },
        onFunctionCall: async (call) => {
          await orchestrator.interceptToolCall(call);
        },
        onFallbackToClassic: () => {
          // Inform the user before the classic (local) Krishna silently takes over.
          if (!handedOffRef.current) {
            handedOffRef.current = true;
            setError(HANDOFF_MESSAGE);
            try {
              void getTTS().speak(HANDOFF_MESSAGE);
            } catch {
              /* announcement is best-effort */
            }
          }
          onSwitchToClassic();
        },
      });

      await client.connect(key);
      await client.startRecording(stream);
      startDurationUpdates();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }, [
    apiKey,
    onSwitchToClassic,
    startDurationUpdates,
    onLiveStatus,
    onLiveUserText,
    onLiveAssistantText,
    onTurnComplete,
  ]);

  const handleStop = useCallback(() => {
    const client = clientRef.current;
    if (client) {
      client.disconnect();
      clientRef.current = null;
    }
    orchestratorRef.current = null;
    loggerRef.current = null;
    stopDurationUpdates();
    setState("idle");
    setDuration("00:00");
    setCostStr("$0.00");
    onLiveStatus?.("idle");
    onLiveUserText?.(null);
    onLiveAssistantText?.(null);
  }, [stopDurationUpdates, onLiveStatus, onLiveUserText, onLiveAssistantText]);

  // Auto-start: honour an explicit `autoStart` override (mobile), otherwise fall
  // back to the persisted settings (desktop's existing behaviour).
  useEffect(() => {
    if (!active) return;
    const settings = getLiveVoiceSettings();
    const shouldAutoStart = autoStart ?? (settings.autoStart || settings.wakeWordEnabled);
    if (!shouldAutoStart || !apiKey || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void handleStart();
  }, [active, autoStart, apiKey, handleStart]);

  // Tear the session down when Live mode is deselected so the mic is released
  // and the next activation can auto-start cleanly.
  useEffect(() => {
    if (!active) {
      autoStartedRef.current = false;
      handleStop();
    }
  }, [active, handleStop]);

  useEffect(() => {
    return () => {
      handleStop();
    };
  }, [handleStop]);

  return {
    state,
    error,
    duration,
    costStr,
    transcript,
    hasApiKey,
    isActive,
    isBusy,
    start: handleStart,
    stop: handleStop,
  };
}
