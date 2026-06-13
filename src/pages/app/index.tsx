import { Card, Updater, DragButton, CustomCursor, Button, Switch } from "@/components";
import {
  SystemAudio,
  Completion,
  AudioVisualizer,
  StatusIndicator,
  ProfileSelector,
  BrainSelector,
  SystemPromptSelector,
} from "./components";
import { useApp, useKrishna } from "@/hooks";
import { useApp as useAppContext } from "@/contexts";
import { LayoutDashboardIcon, BotIcon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "@/layouts";
import { getPlatform } from "@/lib";

const App = () => {
  const krishna = useKrishna();
  const { isHidden, systemAudio } = useApp({
    krishnaEnabled: krishna.enabled,
    onKrishnaCommand: krishna.processCommand,
  });
  const { customizable } = useAppContext();
  const platform = getPlatform();

  const openDashboard = async () => {
    try {
      await invoke("open_dashboard");
    } catch (error) {
      console.error("Failed to open dashboard:", error);
    }
  };

  return (
    <ErrorBoundary
      fallbackRender={() => {
        return <ErrorLayout isCompact />;
      }}
      resetKeys={["app-error"]}
      onReset={() => {
        console.log("Reset");
      }}
    >
      <div
        className={`w-screen h-screen flex overflow-hidden justify-center items-start ${
          isHidden ? "hidden pointer-events-none" : ""
        }`}
      >
        <Card className="w-full flex flex-row items-center gap-1 p-2">
          <SystemAudio {...systemAudio} />
          {systemAudio?.capturing ? (
            <div className="flex flex-row items-center gap-2 justify-between w-full">
              <div className="flex flex-1 items-center gap-2">
                <AudioVisualizer isRecording={systemAudio?.capturing} />
              </div>
              <div className="flex gap-1 items-center">
                {krishna.enabled && krishna.status !== "idle" && (
                  <span className="text-xs text-primary mr-1">
                    {krishna.status === "thinking" ? "..." : krishna.status === "speaking" ? "\u{1F50A}" : ""}
                  </span>
                )}
                <StatusIndicator
                  setupRequired={systemAudio.setupRequired}
                  error={systemAudio.error}
                  isProcessing={systemAudio.isProcessing}
                  isAIProcessing={systemAudio.isAIProcessing}
                  capturing={systemAudio.capturing}
                />
              </div>
            </div>
          ) : null}

          <div
            className={`${
              systemAudio?.capturing
                ? "hidden w-full fade-out transition-all duration-300"
                : "w-full flex flex-row gap-1 items-center"
            }`}
          >
            <Completion isHidden={isHidden} />

            {/* Krishna mode toggle */}
            <div className="flex items-center gap-1" title="Krishna voice assistant">
              <BotIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <Switch
                checked={krishna.enabled}
                onCheckedChange={krishna.setKrishnaEnabled}
                className="scale-75"
                aria-label="Toggle Krishna assistant"
              />
            </div>

            {/* Brain selector — pick AI provider + model */}
            <BrainSelector />

            {/* System prompt selector — choose AI mode */}
            <SystemPromptSelector />

            {/* Profile selector — injects profile knowledge hub into AI answers */}
            <ProfileSelector />

            <Button
              size={"icon"}
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
