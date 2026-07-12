import { useState } from "react";
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
import { useKrishna, useMobileSpeech } from "@/hooks";
import { useApp as useAppContext } from "@/contexts";
import { LiveVoiceBar } from "@/pages/app/components/LiveVoiceBar";
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

/**
 * Mobile home screen — deliberately minimal.
 * One big button: tap to talk (classic), or a Live Voice session when a live
 * endpoint is selected. Top-right: voice-endpoint picker + settings.
 */
export default function MobileHome() {
  const navigate = useNavigate();
  const { status, lastSpoken, streamingReply, maybeLearnStyle } = useKrishna();
  const { customizable, toggleLiveVoiceMode } = useAppContext();
  const {
    isListening,
    isSupported,
    error,
    startListening,
    stopListening,
    handsFree,
    setHandsFree,
  } = useMobileSpeech();

  const [pickerOpen, setPickerOpen] = useState(false);

  const isLiveMode =
    customizable.liveVoice?.enabled && customizable.liveVoice?.mode === "live";
  const currentEndpoint: Endpoint = isLiveMode
    ? (getLiveVoiceSettings().provider as Endpoint)
    : "classic";

  const selectEndpoint = (ep: Endpoint) => {
    setPickerOpen(false);
    if (ep === "classic") {
      toggleLiveVoiceMode("classic");
      updateLiveVoiceSettingsMode("classic");
    } else {
      updateLiveVoiceProvider(ep);
      toggleLiveVoiceMode("live");
      updateLiveVoiceSettingsMode("live");
    }
  };

  const handleSwitchToClassic = () => selectEndpoint("classic");

  const busy = status === "thinking" || status === "speaking";

  const handleTap = () => {
    if (isListening) stopListening();
    else if (!busy) startListening();
  };

  const label = (): string => {
    if (error) return "Tap to try again";
    if (handsFree && isListening) return 'Hands-free — say "hey krishna…"';
    if (isListening) return "Listening… tap to stop";
    if (status === "thinking") return "Thinking…";
    if (status === "speaking") return "Speaking…";
    if (handsFree) return "Hands-free (paused) — or tap to speak";
    return "Tap to speak";
  };

  const reply = streamingReply || lastSpoken;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-between bg-gradient-to-b from-background to-secondary/20 px-6 py-10">
      {/* Top-right: hands-free toggle + endpoint picker + settings */}
      <div className="absolute right-4 top-4 flex items-center gap-2">
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
        {reply && !isLiveMode ? (
          <p className="max-h-[40vh] overflow-y-auto text-lg leading-relaxed text-foreground">
            {reply}
          </p>
        ) : (
          <p className="text-2xl font-semibold text-primary">Krishna</p>
        )}
      </div>

      {isLiveMode ? (
        /* Live Voice session (OpenAI / Gemini realtime) */
        <div className="flex flex-col items-center gap-4 pb-6">
          <div className="flex items-center gap-3 rounded-2xl border border-border/30 bg-background/70 px-4 py-3 shadow-lg">
            <LiveVoiceBar
              onSwitchToClassic={handleSwitchToClassic}
              onTurnComplete={maybeLearnStyle}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Live Voice — {currentEndpoint === "gemini" ? "Gemini" : "OpenAI"}
          </p>
        </div>
      ) : (
        /* Classic: big tap-to-talk mic */
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={handleTap}
            disabled={!isSupported || busy}
            aria-label={label()}
            className={[
              "flex size-40 items-center justify-center rounded-full shadow-xl transition-all active:scale-95",
              isListening
                ? "bg-green-500 animate-pulse"
                : busy
                ? "bg-primary/60"
                : "bg-primary",
              !isSupported ? "opacity-40" : "",
            ].join(" ")}
          >
            {error ? (
              <AlertCircleIcon className="size-16 text-white" />
            ) : status === "thinking" ? (
              <Loader2Icon className="size-16 animate-spin text-white" />
            ) : status === "speaking" ? (
              <Volume2Icon className="size-16 text-white" />
            ) : (
              <MicIcon className="size-16 text-white" />
            )}
          </button>

          <p className="text-sm text-muted-foreground">
            {isSupported ? label() : "Voice input not available on this device"}
          </p>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
