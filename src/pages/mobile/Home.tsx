import { useCallback, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  MicIcon,
  Loader2Icon,
  Volume2Icon,
  AlertCircleIcon,
  SettingsIcon,
  AudioLinesIcon,
  CheckIcon,
  EarIcon,
} from "lucide-react";
import { useKrishna, useMobileSpeech, useLiveVoiceSession } from "@/hooks";
import { useApp as useAppContext } from "@/contexts";
import WakeWordMeter from "./components/WakeWordMeter";
import {
  getLiveVoiceSettings,
  updateLiveVoiceProvider,
  updateLiveVoiceMode as updateLiveVoiceSettingsMode,
} from "@/lib/storage/live-voice-settings.storage";

type Endpoint = "classic" | "openai" | "gemini";

const ENDPOINTS: { id: Endpoint; name: string; hint: string }[] = [
  { id: "classic", name: "Classic (Claude)", hint: "Tap to talk — Anthropic pipeline" },
  { id: "openai", name: "Live — OpenAI", hint: "Realtime conversation" },
  { id: "gemini", name: "Live — Gemini", hint: "Realtime conversation" },
];

/** Unified description of the one big mic button, derived from whichever backend
 * is active so Classic and Live share the exact same UI. */
interface MicView {
  icon: ReactNode;
  bg: string;
  label: string;
  onClick: () => void;
  disabled: boolean;
}

/**
 * Mobile home screen — one consistent UI for every backend.
 * A single big mic button drives Classic tap-to-talk OR a Live (OpenAI/Gemini)
 * realtime session; the top-right picker only swaps the backend behind it.
 */
export default function MobileHome() {
  const navigate = useNavigate();
  const { status, lastSpoken, streamingReply, maybeLearnStyle } = useKrishna();
  const { customizable, toggleLiveVoiceMode } = useAppContext();

  const isLiveMode = !!(
    customizable.liveVoice?.enabled && customizable.liveVoice?.mode === "live"
  );
  const currentEndpoint: Endpoint = isLiveMode
    ? (getLiveVoiceSettings().provider as Endpoint)
    : "classic";

  // Classic hands-free (native KrishnaHandsFreeService on Android) must never
  // run alongside a Live session — it would fight for the mic. Suppressing it
  // here (rather than calling setHandsFree(false)) hands control to Live
  // without touching the user's stored preference, so Classic hands-free
  // resumes on its own the moment Live ends — a two-way handoff instead of a
  // one-way clobber.
  const {
    isListening,
    isSupported,
    error: sttError,
    startListening,
    stopListening,
    handsFree,
    setHandsFree,
  } = useMobileSpeech({ suppressed: isLiveMode });

  const [pickerOpen, setPickerOpen] = useState(false);

  const handleSwitchToClassic = useCallback(() => {
    setPickerOpen(false);
    toggleLiveVoiceMode("classic");
    updateLiveVoiceSettingsMode("classic");
  }, [toggleLiveVoiceMode]);

  // Live realtime session — auto-starts as soon as a Live endpoint is selected,
  // and tears down when we return to Classic (driven by `active`).
  const live = useLiveVoiceSession({
    active: isLiveMode,
    autoStart: true,
    onSwitchToClassic: handleSwitchToClassic,
    onTurnComplete: maybeLearnStyle,
  });

  const selectEndpoint = (ep: Endpoint) => {
    setPickerOpen(false);
    if (ep === "classic") {
      handleSwitchToClassic();
      return;
    }
    // Leaving Classic → stop any in-flight tap-to-talk capture immediately;
    // hands-free is suppressed automatically (see useMobileSpeech above).
    if (isListening) stopListening();
    updateLiveVoiceProvider(ep);
    toggleLiveVoiceMode("live");
    updateLiveVoiceSettingsMode("live");
  };

  const busy = status === "thinking" || status === "speaking";

  const handleClassicTap = () => {
    if (handsFree) {
      setHandsFree(false);
      return;
    }
    if (isListening) stopListening();
    else if (!busy) startListening();
  };

  const classicMic = (): MicView => {
    let icon: ReactNode = <MicIcon className="size-16 text-white" />;
    if (sttError) icon = <AlertCircleIcon className="size-16 text-white" />;
    else if (status === "thinking")
      icon = <Loader2Icon className="size-16 animate-spin text-white" />;
    else if (status === "speaking") icon = <Volume2Icon className="size-16 text-white" />;

    const bg = isListening
      ? "bg-green-500 animate-pulse"
      : busy
      ? "bg-primary/60"
      : "bg-primary";

    let label = "Tap to speak";
    if (sttError) label = "Tap to try again";
    else if (isListening) label = "Listening… tap to stop";
    else if (status === "thinking") label = "Thinking…";
    else if (status === "speaking") label = "Speaking…";

    return {
      icon,
      bg: `${bg}${!isSupported ? " opacity-40" : ""}`,
      label: isSupported ? label : "Voice input not available on this device",
      onClick: handleClassicTap,
      disabled: !isSupported || busy,
    };
  };

  const liveMic = (): MicView => {
    const { state, isActive, isBusy, hasApiKey, error, start, stop } = live;

    let icon: ReactNode = <MicIcon className="size-16 text-white" />;
    if (error) icon = <AlertCircleIcon className="size-16 text-white" />;
    else if (isBusy) icon = <Loader2Icon className="size-16 animate-spin text-white" />;
    else if (state === "speaking") icon = <Volume2Icon className="size-16 text-white" />;

    const bg =
      state === "connected"
        ? "bg-green-500 animate-pulse"
        : state === "speaking"
        ? "bg-primary animate-pulse"
        : isBusy
        ? "bg-primary/60"
        : "bg-primary";

    let label = "Tap to start";
    if (error) label = "Tap to retry";
    else if (isBusy) label = "Connecting…";
    else if (state === "speaking") label = "Speaking…";
    else if (isActive) label = "Listening… tap to stop";
    else if (!hasApiKey) label = "No API key configured";

    return {
      icon,
      bg,
      label,
      onClick: () => (isActive ? stop() : void start()),
      // Can always stop; can only start when a key is present.
      disabled: !isActive && !hasApiKey,
    };
  };

  const mic = isLiveMode ? liveMic() : classicMic();
  const reply = isLiveMode ? live.transcript : streamingReply || lastSpoken;
  const errorText = isLiveMode ? live.error : sttError;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-between bg-gradient-to-b from-background to-secondary/20 px-6 py-10">
      {/* Top-right: (classic only) hands-free toggle + endpoint picker + settings */}
      <div className="absolute right-4 top-4 flex items-center gap-2">
        {!isLiveMode && (
          <button
            type="button"
            aria-label={handsFree ? "Turn off hands-free" : "Turn on hands-free"}
            title="Hands-free: always listen for the wake word"
            onClick={() => setHandsFree(!handsFree)}
            className={`flex size-10 items-center justify-center rounded-full border shadow-sm active:scale-95 ${
              handsFree
                ? "border-green-500/50 bg-green-500/15 text-green-500"
                : "border-border/30 bg-background/70 text-foreground"
            }`}
          >
            <EarIcon className={`size-5 ${handsFree ? "animate-pulse" : ""}`} />
          </button>
        )}
        <div className="relative">
          <button
            type="button"
            aria-label="Choose voice endpoint"
            onClick={() => setPickerOpen((v) => !v)}
            className="flex size-10 items-center justify-center rounded-full border border-border/30 bg-background/70 text-foreground shadow-sm active:scale-95"
          >
            <AudioLinesIcon className="size-5" />
          </button>
          {pickerOpen && (
            <div className="absolute right-0 top-12 z-20 w-64 rounded-xl border border-border/30 bg-background p-1.5 shadow-xl">
              {ENDPOINTS.map((ep) => (
                <button
                  key={ep.id}
                  type="button"
                  onClick={() => selectEndpoint(ep.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left ${
                    currentEndpoint === ep.id ? "bg-primary/10" : "hover:bg-muted/50"
                  }`}
                >
                  <span>
                    <span className="block text-sm font-medium">{ep.name}</span>
                    <span className="block text-xs text-muted-foreground">{ep.hint}</span>
                  </span>
                  {currentEndpoint === ep.id && (
                    <CheckIcon className="size-4 shrink-0 text-primary" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Settings"
          onClick={() => navigate("/mobile/settings")}
          className="flex size-10 items-center justify-center rounded-full border border-border/30 bg-background/70 text-foreground shadow-sm active:scale-95"
        >
          <SettingsIcon className="size-5" />
        </button>
      </div>

      {/* Reply / transcript area */}
      <div
        className="flex w-full flex-1 flex-col items-center justify-center gap-3 text-center"
        onClick={() => pickerOpen && setPickerOpen(false)}
      >
        {reply ? (
          <p className="max-h-[40vh] overflow-y-auto text-lg leading-relaxed text-foreground">
            {reply}
          </p>
        ) : (
          <p className="text-2xl font-semibold text-primary">Krishna</p>
        )}
      </div>

      {/* Wake-word confidence meter — visible in both modes */}
      <div className="w-full max-w-xs mx-auto mb-2">
        <WakeWordMeter />
      </div>

      {/* One big mic — drives Classic tap-to-talk or the Live session */}
      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={mic.onClick}
          disabled={mic.disabled}
          aria-label={mic.label}
          className={[
            "flex size-40 items-center justify-center rounded-full shadow-xl transition-all active:scale-95",
            mic.bg,
          ].join(" ")}
        >
          {mic.icon}
        </button>

        <p className="text-sm text-muted-foreground">{mic.label}</p>
        {isLiveMode && (
          <p className="text-xs text-muted-foreground">
            Live Voice — {currentEndpoint === "gemini" ? "Gemini" : "OpenAI"}
          </p>
        )}
        {errorText && <p className="text-xs text-red-500">{errorText}</p>}
      </div>
    </div>
  );
}
