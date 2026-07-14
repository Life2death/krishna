import { useNavigate } from "react-router-dom";
import { ChevronLeftIcon } from "lucide-react";
import { LiveVoiceSettings } from "@/pages/settings/components/LiveVoiceSettings";
import { WakeWordSettings } from "@/pages/settings/components/WakeWordSettings";
import WakeWordMeter from "./components/WakeWordMeter";
import { useKrishna } from "@/hooks";

/**
 * Mobile settings — reuses the desktop Live Voice settings panel (provider,
 * API keys, model, wake word, voice, language, timeouts) with a back header.
 */
export default function MobileSettings() {
  const navigate = useNavigate();
  const { wakeWord, setWakeWord } = useKrishna();
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/20 bg-background/95 px-3 py-3 backdrop-blur">
        <button
          type="button"
          aria-label="Back"
          onClick={() => navigate("/")}
          className="flex size-9 items-center justify-center rounded-full active:scale-95"
        >
          <ChevronLeftIcon className="size-6" />
        </button>
        <span className="text-base font-semibold">Settings</span>
      </div>
      <div className="p-4 space-y-4">
        <LiveVoiceSettings />

        <div className="border-t border-border/10 pt-4">
          <WakeWordMeter />
        </div>

        <div className="border-t border-border/10 pt-4 space-y-2">
          <div>
            <label className="text-sm font-medium">Classic wake word</label>
            <p className="text-xs text-muted-foreground mt-1">
              Phrase to activate Classic mode hands-free
            </p>
          </div>
          <input
            type="text"
            value={wakeWord}
            onChange={(e) => setWakeWord(e.target.value)}
            placeholder="hey krishna"
            className="w-full max-w-xs text-xs px-2 py-1.5 rounded border border-border/30 bg-background"
          />
        </div>

        <div className="border-t border-border/10 pt-4">
          <WakeWordSettings />
        </div>
      </div>
    </div>
  );
}
