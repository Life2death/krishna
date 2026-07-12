import { useNavigate } from "react-router-dom";
import { ChevronLeftIcon } from "lucide-react";
import { LiveVoiceSettings } from "@/pages/settings/components/LiveVoiceSettings";

/**
 * Mobile settings — reuses the desktop Live Voice settings panel (provider,
 * API keys, model, wake word, voice, language, timeouts) with a back header.
 */
export default function MobileSettings() {
  const navigate = useNavigate();
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
      <div className="p-4">
        <LiveVoiceSettings />
      </div>
    </div>
  );
}
