import { useNavigate } from "react-router-dom";
import { ChevronLeftIcon, ClipboardListIcon, MicIcon } from "lucide-react";
import { LiveVoiceSettings } from "@/pages/settings/components/LiveVoiceSettings";
import { WakeWordSettings } from "@/pages/settings/components/WakeWordSettings";
import WakeWordMeter from "./components/WakeWordMeter";
import AssistantRoleCard from "./components/AssistantRoleCard";
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
        <AssistantRoleCard />

        <button
          type="button"
          onClick={() => navigate("/mobile/settings/upgrades")}
          className="flex w-full items-center justify-between rounded-lg border border-border/30 p-3 text-left active:scale-[0.99]"
        >
          <span className="flex items-center gap-3">
            <ClipboardListIcon className="size-5 text-primary" />
            <span>
              <span className="block text-sm font-medium">Upgrades</span>
              <span className="block text-xs text-muted-foreground">Self-improvement task queue</span>
            </span>
          </span>
          <ChevronLeftIcon className="size-4 rotate-180 text-muted-foreground" />
        </button>

        <div className="flex items-center gap-3 border-t border-border/10 pt-4">
          <MicIcon className="size-5 text-primary" />
          <div>
            <p className="text-sm font-medium">Live Voice</p>
            <p className="text-xs text-muted-foreground">Provider, model, voice, and timeout settings</p>
          </div>
        </div>

        <div className="border-t border-border/10 pt-4">
          <LiveVoiceSettings />
        </div>

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
