import { Card, Updater, DragButton, CustomCursor, Button, KrishnaVAD, MobileVoiceButton } from "@/components";
import { Completion, BrainSelector, LiveVoiceBar } from "./components";
import { useApp, useKrishna } from "@/hooks";
import { useApp as useAppContext } from "@/contexts";
import { SquareIcon, LayoutDashboardIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "@/layouts";
import { useCallback } from "react";
import { getPlatform } from "@/lib";
import {
  getLiveVoiceSettings,
  updateLiveVoiceProvider,
} from "@/lib/storage/live-voice-settings.storage";

type VoiceSelection = "classic" | "openai" | "gemini";

const App = () => {
  const krishna = useKrishna();
  const { customizable, toggleLiveVoiceMode, toggleLiveVoiceEnabled } = useAppContext();

  const isLiveMode = customizable.liveVoice?.enabled && customizable.liveVoice?.mode === "live";
  const isClassicMode = !isLiveMode;

  // Derived so it always reflects the real state (incl. auto-fallback to classic).
  const voiceSelection: VoiceSelection = isLiveMode
    ? getLiveVoiceSettings().provider === "gemini"
      ? "gemini"
      : "openai"
    : "classic";

  const handleVoiceSelect = useCallback(
    (v: VoiceSelection) => {
      if (v === "classic") {
        toggleLiveVoiceMode("classic");
      } else {
        updateLiveVoiceProvider(v);
        toggleLiveVoiceEnabled(true);
        toggleLiveVoiceMode("live");
      }
    },
    [toggleLiveVoiceMode, toggleLiveVoiceEnabled],
  );

  // Run the classic capture pipeline ONLY in classic mode. In Live mode the
  // realtime session handles the mic, so keeping classic capture on made both
  // pipelines answer the same utterance (double voices).
  const { isHidden } = useApp({
    krishnaEnabled: isClassicMode,
    onKrishnaCommand: krishna.processCommand,
  });
  const platform = getPlatform();

  const handleSwitchToClassic = useCallback(() => {
    toggleLiveVoiceMode("classic");
  }, [toggleLiveVoiceMode]);

  const openDashboard = async () => {
    try {
      await invoke("open_dashboard");
    } catch (error) {
      console.error("Failed to open dashboard:", error);
    }
  };

  return (
    <ErrorBoundary
      fallbackRender={() => <ErrorLayout isCompact />}
      resetKeys={["app-error"]}
      onReset={() => console.log("Reset")}
    >
      <div
        className={`w-screen h-screen flex overflow-hidden justify-center items-start ${
          isHidden ? "hidden pointer-events-none" : ""
        }`}
      >
        <Card className="w-full flex flex-row items-center gap-1 p-2">
          {isClassicMode ? <KrishnaVAD /> : (
            <LiveVoiceBar
              onSwitchToClassic={handleSwitchToClassic}
              onTurnComplete={krishna.maybeLearnStyle}
            />
          )}
          <MobileVoiceButton />
          {(krishna.status === "speaking" || krishna.status === "thinking") && (
            <Button
              size="icon"
              className="cursor-pointer bg-red-50 hover:bg-red-100"
              title="Stop Krishna"
              onClick={krishna.stopSpeaking}
            >
              <SquareIcon className="h-4 w-4 text-red-500" />
            </Button>
          )}

          <div className="w-full flex flex-row gap-1 items-center">
            <Completion isHidden={isHidden} />
            <BrainSelector />
            {/* Voice mode: Classic / OpenAI Live / Gemini Live. Native <select>
                so its menu is OS-drawn and isn't clipped by the tiny window. */}
            <select
              value={voiceSelection}
              onChange={(e) => handleVoiceSelect(e.target.value as VoiceSelection)}
              title="Voice mode"
              className="h-9 text-xs rounded-md border border-border/30 bg-background px-2 cursor-pointer"
            >
              <option value="classic">Classic</option>
              <option value="openai">OpenAI Live</option>
              <option value="gemini">Gemini Live</option>
            </select>
            {/* Dashboard: full conversation history including live-voice turns
                (both classic and live are persisted there). */}
            <Button
              size="icon"
              className="cursor-pointer"
              title="Open Dashboard"
              onClick={openDashboard}
            >
              <LayoutDashboardIcon className="h-4 w-4" />
            </Button>
          </div>

          <Updater />
          <DragButton />
        </Card>
        {customizable.cursor.type === "invisible" && platform !== "linux" ? (
          <CustomCursor />
        ) : null}
      </div>
    </ErrorBoundary>
  );
};

export default App;
