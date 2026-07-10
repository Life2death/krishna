import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components";
import { createRealtimeClient, type IRealtimeClient } from "@/lib/realtime/realtime-provider";
import { secureStorage } from "@/lib/secure-storage";
import { getRealtimeTools } from "@/lib/realtime/live-tool-bridge";
import { LiveOrchestrator } from "@/lib/realtime/live-orchestrator";
import { getLiveVoiceSettings } from "@/lib/storage/live-voice-settings.storage";
import { LiveTurnLogger } from "@/lib/realtime/live-turn-logger";
import { getAllMemories } from "@/lib/repo-bound";
import { formatMemoriesBlock } from "@/lib/memory";
import { getTTS } from "@/lib/tts";
import { MicIcon, MicOffIcon, Loader2Icon, AlertCircleIcon } from "lucide-react";

const HANDOFF_MESSAGE =
  "Connection issue. Handing over to local Krishna.";

const STORAGE_KEY_REALTIME_KEY = "openai_realtime_api_key";
const STORAGE_KEY_GEMINI_KEY = "gemini_realtime_api_key";

interface LiveVoiceBarProps {
  onSwitchToClassic: () => void;
  // Bubble the live session up to the shell so the Live Transcript popover works.
  onLiveStatus?: (status: string) => void;
  onLiveUserText?: (text: string | null) => void;
  onLiveAssistantText?: (text: string | null) => void;
  // Called after each completed live turn so the learning loop can run.
  onTurnComplete?: () => void;
}

export const LiveVoiceBar = ({
  onSwitchToClassic,
  onLiveStatus,
  onLiveUserText,
  onLiveAssistantText,
  onTurnComplete,
}: LiveVoiceBarProps) => {
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

  useEffect(() => {
    const settings = getLiveVoiceSettings();
    // Auto-start when explicitly enabled, or when wake word is on (so it's
    // always listening for the wake word without a manual mic tap).
    if (
      (!settings.autoStart && !settings.wakeWordEnabled) ||
      !apiKey ||
      autoStartedRef.current
    )
      return;
    autoStartedRef.current = true;
    void handleStart();
  }, [apiKey, handleStart]);

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

  useEffect(() => {
    return () => {
      handleStop();
    };
  }, [handleStop]);

  const stateColor: Record<string, string> = {
    idle: "bg-zinc-400",
    connecting: "bg-yellow-400 animate-pulse",
    connected: "bg-green-400",
    speaking: "bg-blue-400 animate-pulse",
    disconnecting: "bg-yellow-400",
    error: "bg-red-400",
    offline: "bg-orange-400 animate-pulse",
  };

  const getMicButton = () => {
    if (isBusy) {
      return (
        <Button size="icon" disabled className="bg-muted">
          <Loader2Icon className="h-4 w-4 animate-spin" />
        </Button>
      );
    }
    if (isActive) {
      return (
        <Button
          size="icon"
          onClick={handleStop}
          className="bg-red-50 hover:bg-red-100"
          title="Stop Live Voice"
        >
          <MicOffIcon className="h-4 w-4 text-red-500" />
        </Button>
      );
    }
    return (
      <Button
        size="icon"
        onClick={handleStart}
        disabled={!hasApiKey}
        className="bg-green-50 hover:bg-green-100"
        title="Start Live Voice"
      >
        <MicIcon className="h-4 w-4 text-green-500" />
      </Button>
    );
  };

  return (
    <>
      {getMicButton()}
      <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-[120px]">
        <span className={`inline-block w-2 h-2 rounded-full ${stateColor[state] || "bg-zinc-400"}`} />
        <span className="font-mono tabular-nums">{duration}</span>
        <span className="font-mono tabular-nums">{costStr}</span>
      </div>
      {transcript && (
        <span className="text-xs text-muted-foreground truncate max-w-[120px] hidden md:inline">
          {transcript}
        </span>
      )}
      {error && !isActive && (
        <Button
          size="sm"
          variant="outline"
          className="text-xs gap-1 text-red-400 border-red-400/30"
          onClick={onSwitchToClassic}
        >
          <AlertCircleIcon className="h-3 w-3" />
          Switch to Classic
        </Button>
      )}
      {!hasApiKey && state === "idle" && (
        <span className="text-xs text-yellow-400">No API key</span>
      )}
    </>
  );
};
