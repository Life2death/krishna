import { Card, Updater, DragButton, CustomCursor, Button, KrishnaVAD, KrishnaChat, MobileVoiceButton, LiveTranscript, Popover, PopoverContent, PopoverTrigger } from "@/components";
import { Completion, BrainSelector, SystemPromptSelector, LiveVoiceBar } from "./components";
import { useApp, useKrishna } from "@/hooks";
import { useApp as useAppContext } from "@/contexts";
import { LayoutDashboardIcon, SquareIcon, CaptionsIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "@/layouts";
import { useState, useCallback } from "react";
import { getPlatform } from "@/lib";

const App = () => {
  const krishna = useKrishna();
  const { customizable, toggleLiveVoiceMode } = useAppContext();

  const isLiveMode = customizable.liveVoice?.enabled && customizable.liveVoice?.mode === "live";
  const isClassicMode = !isLiveMode;

  // Run the classic capture pipeline ONLY in classic mode. In Live mode the
  // realtime session handles the mic, so keeping classic capture on made both
  // pipelines answer the same utterance (double voices).
  const { isHidden } = useApp({
    krishnaEnabled: isClassicMode,
    onKrishnaCommand: krishna.processCommand,
  });
  const platform = getPlatform();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [liveStatus, setLiveStatus] = useState("idle");
  const [liveUserText, setLiveUserText] = useState<string | null>(null);
  const [liveAssistantText, setLiveAssistantText] = useState<string | null>(null);

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
              onLiveStatus={setLiveStatus}
              onLiveUserText={setLiveUserText}
              onLiveAssistantText={setLiveAssistantText}
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
            <SystemPromptSelector />
            <KrishnaChat />
            <Popover open={transcriptOpen} onOpenChange={setTranscriptOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="icon"
                  className="cursor-pointer"
                  title="Live transcript"
                >
                  <CaptionsIcon className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" side="bottom" sideOffset={8} className="w-80 p-0">
                <div className="px-3 py-2 border-b border-border/20">
                  <span className="text-sm font-semibold">Live Transcript</span>
                </div>
                <LiveTranscript
                  override={
                    isLiveMode
                      ? {
                          status: liveStatus,
                          userText: liveUserText,
                          assistantText: liveAssistantText,
                        }
                      : undefined
                  }
                />
              </PopoverContent>
            </Popover>
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
