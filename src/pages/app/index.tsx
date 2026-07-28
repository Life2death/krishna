import { Card, Updater, DragButton, CustomCursor, Button, KrishnaVAD, MobileVoiceButton } from "@/components";
import { Completion, BrainSelector, VoiceModeSelector, LiveVoiceBar, CollapsedPill } from "./components";
import { useApp, useKrishna, useOverlayCollapse, useWindowFocus, isAnyPopoverOpen } from "@/hooks";
import { useApp as useAppContext } from "@/contexts";
import { SquareIcon, LayoutDashboardIcon, KeyboardIcon, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ErrorBoundary } from "react-error-boundary";
import { ErrorLayout } from "@/layouts";
import { useCallback, useMemo, useEffect, useRef } from "react";
import { getPlatform, deriveVoiceState } from "@/lib";

/** How long the overlay waits after Krishna goes idle before auto-collapsing
 * — long enough to read a short final reply before it shrinks away. */
const AUTO_COLLAPSE_AFTER_IDLE_MS = 5000;
/** Debounce on focus-lost before collapsing, so a click that's actually
 * moving focus into a popover-owning child doesn't trip it. */
const AUTO_COLLAPSE_FOCUS_LOST_DEBOUNCE_MS = 200;

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
  const { collapsed, collapse, expand } = useOverlayCollapse();

  // Drives the collapsed overlay icon's spin speed/color (see
  // src/lib/voice-state.ts).
  const voiceState = useMemo(
    () =>
      deriveVoiceState({
        status: krishna.status,
        vadPhase: krishna.vadPhase,
        dictationRecording: dictation.isRecording,
        dictationTranscribing: dictation.isTranscribing,
        liveVoicePhase: krishna.liveVoicePhase,
      }),
    [
      krishna.status,
      krishna.vadPhase,
      krishna.liveVoicePhase,
      dictation.isRecording,
      dictation.isTranscribing,
    ]
  );

  const dictationTitle = !customizable.dictation.enabled
    ? "Dictation (disabled — enable in Settings)"
    : dictation.isTranscribing
    ? "Dictation: transcribing..."
    : dictation.isRecording
    ? "Dictation: recording (click to stop)"
    : "Dictation (click to start — types into whatever app has focus)";

  // Auto-collapse #1: after Krishna finishes a turn (goes idle from a busy
  // state) and stays idle for a moment, shrink back to the pill. Cancelled if
  // status leaves idle again before the timer fires — see the effect
  // dependency: React tears down and re-arms this on every status change, so
  // the timer body only ever runs once nothing has changed status since.
  const prevStatusRef = useRef(krishna.status);
  useEffect(() => {
    const wasBusy = prevStatusRef.current !== "idle";
    prevStatusRef.current = krishna.status;
    if (collapsed || krishna.status !== "idle" || !wasBusy) return;

    const timer = setTimeout(() => {
      if (!isAnyPopoverOpen()) collapse();
    }, AUTO_COLLAPSE_AFTER_IDLE_MS);
    return () => clearTimeout(timer);
  }, [krishna.status, collapsed, collapse]);

  // Auto-collapse #2: clicking away from the overlay. Suppressed whenever
  // collapsing would interrupt something — an open popover, dictation in
  // progress, or Krishna mid-turn.
  //
  // Not suppressed here (known gap): a screen-capture overlay stealing focus
  // mid-screenshot would also trigger this. CaptureState.overlay_active
  // exists in Rust (capture.rs) but has no JS mirror yet to check against.
  //
  // macOS: the main window is a non-activating NSPanel there, so
  // onFocusChanged semantics differ from Windows — gated off until verified.
  //
  // The onFocusLost/onFocusGained callbacks below MUST have a stable identity
  // — useWindowFocus's effect re-subscribes the underlying Tauri listener
  // whenever they change, and inline arrow functions get a new identity every
  // render, which leaked one listener per render (confirmed live: a single
  // focus change fired the diagnostic log 6-8 times). Reading the latest
  // values via refs instead of closing over them directly keeps the callback
  // identity fixed for the component's lifetime while still checking current
  // state when the timer actually fires.
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  const krishnaStatusRef = useRef(krishna.status);
  krishnaStatusRef.current = krishna.status;
  const dictationRef = useRef(dictation);
  dictationRef.current = dictation;

  const focusLostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleOverlayFocusLost = useCallback(() => {
    if (platform === "macos") return;
    if (focusLostTimerRef.current) clearTimeout(focusLostTimerRef.current);
    focusLostTimerRef.current = setTimeout(() => {
      if (
        collapsedRef.current ||
        isAnyPopoverOpen() ||
        dictationRef.current.isRecording ||
        dictationRef.current.isTranscribing ||
        krishnaStatusRef.current === "thinking" ||
        krishnaStatusRef.current === "speaking" ||
        krishnaStatusRef.current === "confirming"
      ) {
        return;
      }
      collapse();
    }, AUTO_COLLAPSE_FOCUS_LOST_DEBOUNCE_MS);
  }, [collapse, platform]);

  const handleOverlayFocusGained = useCallback(() => {
    if (focusLostTimerRef.current) {
      clearTimeout(focusLostTimerRef.current);
      focusLostTimerRef.current = null;
    }
  }, []);

  useWindowFocus({
    onFocusLost: handleOverlayFocusLost,
    onFocusGained: handleOverlayFocusGained,
  });

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
        {/* The collapsed pill. Rendered as a sibling of the bar rather than
            replacing it — see the wrapper comment below. */}
        {collapsed && <CollapsedPill state={voiceState} onExpand={expand} />}

        {/* The expanded bar is CSS-hidden while collapsed, NEVER unmounted:
            KrishnaVAD owns useMicVAD and LiveVoiceBar owns the realtime
            session, so unmounting either releases the microphone and kills
            always-listening / wake-word / barge-in. Same reasoning as the
            existing `isHidden` handling above, which also hides via classes
            rather than tearing the tree down. Fixed at the bar's real size so
            a 600px-wide subtree inside a 40px window can't reflow anything,
            and opacity (not display:none) so the transition can play and
            layout measurements inside KrishnaVAD stay valid. */}
        <div
          className={`absolute inset-0 w-[600px] h-[54px] transition-opacity duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            collapsed ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
          aria-hidden={collapsed}
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
        </div>
        {customizable.cursor.type === "invisible" && platform !== "linux" ? (
          <CustomCursor />
        ) : null}
      </div>
    </ErrorBoundary>
  );
};

export default App;
