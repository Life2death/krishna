import { MicIcon, Loader2Icon, Volume2Icon, AlertCircleIcon } from "lucide-react";
import { useKrishna, useMobileSpeech } from "@/hooks";

/**
 * Mobile home screen — deliberately minimal.
 * One big button: tap to talk, tap again to stop. When you stop, whatever you
 * said is handed to Krishna's normal command pipeline (which runs the action).
 * No dashboard, no settings clutter — just talk → act.
 */
export default function MobileHome() {
  const { status, lastSpoken, streamingReply } = useKrishna();
  const { isListening, isSupported, error, startListening, stopListening } =
    useMobileSpeech();

  const busy = status === "thinking" || status === "speaking";

  const handleTap = () => {
    if (isListening) stopListening();
    else if (!busy) startListening();
  };

  const label = (): string => {
    if (error) return "Tap to try again";
    if (isListening) return "Listening… tap to stop";
    if (status === "thinking") return "Thinking…";
    if (status === "speaking") return "Speaking…";
    return "Tap to speak";
  };

  const reply = streamingReply || lastSpoken;

  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-gradient-to-b from-background to-secondary/20 px-6 py-10">
      {/* Reply / transcript area */}
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-3 text-center">
        {reply ? (
          <p className="max-h-[40vh] overflow-y-auto text-lg leading-relaxed text-foreground">
            {reply}
          </p>
        ) : (
          <p className="text-2xl font-semibold text-primary">Krishna</p>
        )}
      </div>

      {/* Big mic button */}
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
    </div>
  );
}
