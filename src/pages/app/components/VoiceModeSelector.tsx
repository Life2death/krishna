import { Button, Popover, PopoverContent, PopoverTrigger } from "@/components";
import { useApp } from "@/contexts";
import { useWindowResize } from "@/hooks";
import { AudioLinesIcon, CheckIcon } from "lucide-react";
import { useState } from "react";
import {
  getLiveVoiceSettings,
  updateLiveVoiceProvider,
} from "@/lib/storage/live-voice-settings.storage";

type VoiceSel = "classic" | "openai" | "gemini";

const OPTIONS: { id: VoiceSel; label: string; desc: string }[] = [
  { id: "classic", label: "Classic", desc: "VAD → STT → LLM → TTS" },
  { id: "openai", label: "OpenAI Live", desc: "Realtime speech-to-speech" },
  { id: "gemini", label: "Gemini Live", desc: "Google native audio" },
];

/** Icon + dropdown to switch the voice mode/provider, styled like BrainSelector. */
export const VoiceModeSelector = () => {
  const { customizable, toggleLiveVoiceMode, toggleLiveVoiceEnabled } = useApp();
  const { resizeWindow } = useWindowResize();
  const [open, setOpen] = useState(false);

  const isLive =
    customizable.liveVoice?.enabled && customizable.liveVoice?.mode === "live";
  const current: VoiceSel = isLive
    ? getLiveVoiceSettings().provider === "gemini"
      ? "gemini"
      : "openai"
    : "classic";

  const handleOpen = (val: boolean) => {
    setOpen(val);
    resizeWindow(val);
  };

  const select = (v: VoiceSel) => {
    if (v === "classic") {
      toggleLiveVoiceMode("classic");
    } else {
      updateLiveVoiceProvider(v);
      toggleLiveVoiceEnabled(true);
      toggleLiveVoiceMode("live");
    }
    handleOpen(false);
  };

  const activeLabel = OPTIONS.find((o) => o.id === current)?.label ?? "Voice";

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant={isLive ? "default" : "ghost"}
          className="relative cursor-pointer shrink-0"
          title={`Voice: ${activeLabel}`}
        >
          <AudioLinesIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-2" align="end" side="bottom" sideOffset={6}>
        <p className="text-xs font-semibold text-muted-foreground px-2 mb-1">
          Voice mode
        </p>
        <div className="space-y-0.5 px-1">
          {OPTIONS.map((o) => {
            const active = o.id === current;
            return (
              <button
                key={o.id}
                onClick={() => select(o.id)}
                className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{o.label}</p>
                  <p
                    className={`text-[10px] truncate ${
                      active ? "text-primary-foreground/80" : "text-muted-foreground"
                    }`}
                  >
                    {o.desc}
                  </p>
                </div>
                {active && <CheckIcon className="size-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};
