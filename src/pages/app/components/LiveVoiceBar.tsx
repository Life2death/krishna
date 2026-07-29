import { useEffect } from "react";
import { Button } from "@/components";
import { useLiveVoiceSession } from "@/hooks/useLiveVoiceSession";
import { useKrishna } from "@/hooks";
import { MicIcon, MicOffIcon, Loader2Icon, AlertCircleIcon } from "lucide-react";

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
  const {
    state,
    error,
    duration,
    costStr,
    transcript,
    hasApiKey,
    isActive,
    isBusy,
    start,
    stop,
  } = useLiveVoiceSession({
    onSwitchToClassic,
    onLiveStatus,
    onLiveUserText,
    onLiveAssistantText,
    onTurnComplete,
  });

  // Push the realtime session's phase up to the Krishna context — this is the
  // only place that owns useLiveVoiceSession, so it's the only place that can
  // know this. Feeds deriveVoiceState (src/lib/voice-state.ts) for the
  // collapsed overlay icon. Reset to "" on unmount so switching back to
  // Classic mode doesn't leave a stale live-session phase behind.
  const { setLiveVoicePhase } = useKrishna();
  useEffect(() => {
    setLiveVoicePhase(state);
    return () => setLiveVoicePhase("");
  }, [state, setLiveVoicePhase]);

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
          onClick={stop}
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
        onClick={start}
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
