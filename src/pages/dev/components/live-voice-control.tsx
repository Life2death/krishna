import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components";
import { useApp } from "@/contexts";
import { RealtimeClient } from "@/lib/realtime/realtime-client";
import { secureStorage } from "@/lib/secure-storage";
import { getRealtimeTools } from "@/lib/realtime/live-tool-bridge";
import { LiveOrchestrator } from "@/lib/realtime/live-orchestrator";
import { LiveTurnLogger } from "@/lib/realtime/live-turn-logger";
import type {
  RealtimeTimingMarks,
} from "@/lib/realtime/realtime-types";
import { formatDuration, formatCost } from "@/lib/realtime/realtime-cost";

const STORAGE_KEY_REALTIME_KEY = "openai_realtime_api_key";

function formatMs(ms: number | undefined): string {
  if (ms === undefined) return "-";
  return `${Math.round(ms)}ms`;
}

interface LiveTranscript {
  text: string;
  isFinal: boolean;
  timestamp: number;
}

interface TimingDisplay {
  label: string;
  value: number | undefined;
}

interface ToolCallEvent {
  name: string;
  args: string;
  status: "started" | "complete" | "sensitive_blocked" | "confirmed" | "declined";
  timestamp: number;
}

function sinceConnect(
  timing: RealtimeTimingMarks | null,
  mark: number | undefined,
): number | undefined {
  if (!timing || mark === undefined) return undefined;
  return mark - timing.connectStart;
}

export const LiveVoiceControl = () => {
  const { customizable, toggleLiveVoiceEnabled } = useApp();
  const liveVoiceEnabled = customizable.liveVoice?.enabled ?? false;

  const clientRef = useRef<RealtimeClient | null>(null);
  const orchestratorRef = useRef<LiveOrchestrator | null>(null);
  const loggerRef = useRef<LiveTurnLogger | null>(null);

  const [sessionState, setSessionState] =
    useState<string>("idle");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState<LiveTranscript | null>(
    null,
  );
  const [userTranscript, setUserTranscript] = useState<string | null>(null);
  const [timing, setTiming] = useState<RealtimeTimingMarks | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assistantTranscript, setAssistantTranscript] = useState<
    string | null
  >(null);
  const [toolCalls, setToolCalls] = useState<ToolCallEvent[]>([]);
  const [sessionDuration, setSessionDuration] = useState("00:00");
  const [sessionCost, setSessionCost] = useState("$0.00");

  useEffect(() => {
    if (apiKeyLoaded) return;
    secureStorage.get(STORAGE_KEY_REALTIME_KEY).then((val) => {
      if (val) setApiKey(val);
      setApiKeyLoaded(true);
    });
  }, [apiKeyLoaded]);

  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startDurationUpdates = useCallback((client: RealtimeClient) => {
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    durationIntervalRef.current = setInterval(() => {
      setSessionDuration(client.getSessionDurationFormatted());
      setSessionCost(client.getEstimatedCost());
    }, 1000);
  }, []);

  const stopDurationUpdates = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const addToolCall = useCallback((evt: ToolCallEvent) => {
    setToolCalls((prev) => [evt, ...prev].slice(0, 20));
  }, []);

  const handleStart = useCallback(async () => {
    setError(null);
    setLiveTranscript(null);
    setUserTranscript(null);
    setAssistantTranscript(null);
    setToolCalls([]);

    if (!apiKey) {
      setError("Enter an OpenAI API key first");
      return;
    }

    await secureStorage.set(STORAGE_KEY_REALTIME_KEY, apiKey);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const client = new RealtimeClient();
      clientRef.current = client;

      const orchestrator = new LiveOrchestrator(client, {
        onToolCallStart: (name, args) => {
          addToolCall({ name, args: JSON.stringify(args), status: "started", timestamp: Date.now() });
          setTiming(client.timing);
        },
        onToolCallComplete: (name) => {
          addToolCall({ name, args: "", status: "complete", timestamp: Date.now() });
          setTiming(client.timing);
        },
        onConfirmationRequest: (name, args) => {
          addToolCall({ name, args: JSON.stringify(args), status: "sensitive_blocked", timestamp: Date.now() });
          setUserTranscript(`[Awaiting confirmation for: ${name}]`);
        },
        onConfirmationResult: (name, accepted) => {
          addToolCall({ name, args: "", status: accepted ? "confirmed" : "declined", timestamp: Date.now() });
          setUserTranscript(accepted ? `[Confirmed: ${name}]` : `[Declined: ${name}]`);
        },
      });
      orchestratorRef.current = orchestrator;

      const logger = new LiveTurnLogger(client.config.model);
      loggerRef.current = logger;

      client.tools = getRealtimeTools();

      client.setCallbacks({
        onStateChange: (state) => {
          setSessionState(state);
          setTiming(client.timing);
        },
        onError: (msg, code) => {
          setError(code ? `${code}: ${msg}` : msg);
        },
        onTranscript: (text, isFinal) => {
          setAssistantTranscript(text);
          setLiveTranscript({ text, isFinal, timestamp: Date.now() });
          setTiming(client.timing);
          logger.handleTranscript(text);
        },
        onUserTranscript: (text) => {
          setUserTranscript(text);
          setTiming(client.timing);
          orchestrator.handleUserTranscript(text);
          logger.handleUserTranscript(text);
        },
        onAudioDelta: () => {
          setTiming(client.timing);
          logger.handleAudioDelta();
        },
        onResponseCreated: () => {
          logger.handleResponseCreated();
        },
        onResponseDone: ({ usage }) => {
          void logger.handleResponseDone(usage);
        },
        onFunctionCall: async (call) => {
          await orchestrator.interceptToolCall(call);
        },
      });

      await client.connect(apiKey);
      await client.startRecording(stream);
      startDurationUpdates(client);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }, [apiKey, addToolCall]);

  const handleStop = useCallback(() => {
    const client = clientRef.current;
    if (client) {
      client.disconnect();
      clientRef.current = null;
    }
    orchestratorRef.current = null;
    loggerRef.current = null;
    stopDurationUpdates();
    setSessionState("idle");
    setSessionDuration("00:00");
    setSessionCost("$0.00");
  }, [stopDurationUpdates]);

  useEffect(() => {
    return () => {
      handleStop();
    };
  }, [handleStop]);

  const timingRows: TimingDisplay[] = [
    {
      label: "Connect to ready",
      value: sinceConnect(timing, timing?.connectedAt),
    },
    {
      label: "First transcript delta",
      value: sinceConnect(timing, timing?.firstTranscriptDelta),
    },
    {
      label: "First audio delta",
      value: sinceConnect(timing, timing?.firstAudioDelta),
    },
    {
      label: "First user transcript",
      value: sinceConnect(timing, timing?.firstUserTranscript),
    },
    {
      label: "Response created",
      value: sinceConnect(timing, timing?.responseCreated),
    },
    {
      label: "Response done",
      value: sinceConnect(timing, timing?.responseDone),
    },
    {
      label: "Tool call received",
      value: sinceConnect(timing, timing?.toolCallReceived),
    },
    {
      label: "Tool executed",
      value: sinceConnect(timing, timing?.toolExecuted),
    },
  ];

  const isActive =
    sessionState === "connected" ||
    sessionState === "speaking" ||
    sessionState === "connecting";

  const stateColor: Record<string, string> = {
    idle: "text-zinc-400",
    connecting: "text-yellow-400",
    connected: "text-green-400",
    speaking: "text-blue-400",
    disconnecting: "text-yellow-400",
    error: "text-red-400",
    offline: "text-orange-400",
  };

  const toolStatusColor: Record<string, string> = {
    started: "text-blue-400",
    complete: "text-green-400",
    sensitive_blocked: "text-yellow-400",
    confirmed: "text-green-400",
    declined: "text-red-400",
  };

  return (
    <div className="space-y-4">
      <Header
        title="Live Voice (Stage 3)"
        description="OpenAI Realtime audio session with tool orchestration, cost controls, and language support"
      />

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={liveVoiceEnabled}
            onChange={(e) => toggleLiveVoiceEnabled(e.target.checked)}
            className="rounded"
          />
          Enable Live Voice feature
        </label>
      </div>

      {liveVoiceEnabled && (
        <div className="space-y-3 border border-border/20 rounded-lg p-4 bg-muted/10">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                sessionState === "idle"
                  ? "bg-zinc-400"
                  : sessionState === "connecting"
                    ? "bg-yellow-400 animate-pulse"
                    : sessionState === "connected"
                      ? "bg-green-400"
                      : sessionState === "speaking"
                        ? "bg-blue-400 animate-pulse"
                        : sessionState === "offline"
                          ? "bg-orange-400 animate-pulse"
                          : "bg-red-400"
              }`}
            />
            <span className={`text-xs font-medium ${stateColor[sessionState] || "text-zinc-400"}`}>
              {sessionState.toUpperCase()}
            </span>
            {isActive && (
              <button
                onClick={handleStop}
                className="ml-auto text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
              >
                Stop
              </button>
            )}
            {!isActive && sessionState === "idle" && (
              <button
                onClick={handleStart}
                disabled={!apiKey}
                className="ml-auto text-xs px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-40"
              >
                Start Live Voice
              </button>
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              OpenAI API key (stored with secureStorage; dev-only direct connection)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full text-xs px-2 py-1 rounded border border-border/30 bg-background font-mono"
            />
          </div>

          {isActive && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>Session: <span className="font-mono tabular-nums">{sessionDuration}</span></span>
              <span>Est. cost: <span className="font-mono tabular-nums">{sessionCost}</span></span>
            </div>
          )}

          {userTranscript && (
            <div className="text-xs">
              <span className="text-muted-foreground">You said: </span>
              <span>{userTranscript}</span>
            </div>
          )}

          {assistantTranscript && (
            <div className="text-xs">
              <span className="text-muted-foreground">Krishna: </span>
              <span>{assistantTranscript}</span>
            </div>
          )}

          {liveTranscript && !liveTranscript.isFinal && (
            <div className="text-xs text-muted-foreground italic animate-pulse">
              {liveTranscript.text}
            </div>
          )}

          {toolCalls.length > 0 && (
            <div className="pt-2 border-t border-border/10">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Tool Calls
              </div>
              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                {toolCalls.map((tc, i) => (
                  <div key={i} className="text-xs flex items-center gap-2">
                    <span className={toolStatusColor[tc.status]}>
                      [{tc.status}]
                    </span>
                    <span className="font-mono">{tc.name}</span>
                    {tc.args && (
                      <span className="text-muted-foreground truncate max-w-[200px]">
                        {tc.args}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 rounded p-2">
              {error}
            </div>
          )}

          {timing && (
            <div className="pt-2 border-t border-border/10">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Session Timing (from connect start)
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {timingRows.map((row) => (
                  <div key={row.label} className="text-xs flex justify-between">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="tabular-nums font-mono">
                      {formatMs(row.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
