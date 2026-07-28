import { Card, Updater, DragButton, CustomCursor, Button, KrishnaVAD, MobileVoiceButton } from "@/components";
import { Completion, BrainSelector, VoiceModeSelector, LiveVoiceBar } from "./components";
import { useApp, useKrishna } from "@/hooks";
import { useApp as useAppContext } from "@/contexts";
import { SquareIcon, LayoutDashboardIcon, KeyboardIcon, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "@/layouts";
import { useCallback } from "react";
import { getPlatform } from "@/lib";

const App = () => {
  const krishna = useKrishna();
  const { customizable, toggleLiveVoiceMode } = useAppContext();

  const isLiveMode = customizable.liveVoice?.enabled && customizable.liveVoice?.mode === "live";
  const isClassicMode = !isLiveMode;

  // Run the classic capture pipeline ONLY in classic mode. In Live mode the
  // realtime session handles the mic, so keeping classic capture on made both
  // pipelines answer the same utterance (double voices).
  const { isHidden, dictation } = useApp({
    krishnaEnabled: isClassicMode,
    onKrishnaCommand: krishna.processCommand,
  });
  const platform = getPlatform();

  const dictationTitle = !customizable.dictation.enabled
    ? "Dictation (disabled — enable in Settings)"
    : dictation.isTranscribing
    ? "Dictation: transcribing..."
    : dictation.isRecording
    ? "Dictation: recording (click to stop)"
    : "Dictation (click to start — types into whatever app has focus)";

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
            {/* Dictation: mirrors the global hotkey (Ctrl+Shift+J by default) —
                click to start, click again to stop+transcribe+type into
                whatever app currently has OS focus. Same toggle fn as the
                hotkey listener (useDictation's triggerDictation), so both
                paths can't drift out of sync. */}
            <Button
              size="icon"
              variant={dictation.isRecording ? "default" : "ghost"}
              className={`relative cursor-pointer shrink-0 ${
                dictation.isRecording ? "bg-red-500 hover:bg-red-600 text-white" : ""
              }`}
              title={dictationTitle}
              onClick={dictation.triggerDictation}
            >
              {dictation.isTranscribing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyboardIcon className="h-4 w-4" />
              )}
              {!customizable.dictation.enabled && (
                <span className="absolute -top-1 -right-1 flex size-2 rounded-full bg-muted-foreground/50" />
              )}
            </Button>
            {/* Voice mode: Classic / OpenAI Live / Gemini Live (icon + dropdown,
                resizes the window on open so the menu isn't clipped). */}
            <VoiceModeSelector />
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
