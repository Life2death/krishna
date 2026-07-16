import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isMobileDevice } from "@/lib/platform";

interface UseAssistTriggerOpts {
  /** Are we currently in a Live (realtime) session, vs Classic tap-to-talk? */
  isLiveMode: boolean;
  /** Is the Live session already actively listening? */
  isLiveActive: boolean;
  /** Classic: start() from useMobileSpeech. */
  startClassicListening: () => void;
  /** Live: start() from useLiveVoiceSession. */
  startLive: () => void;
}

/**
 * Polls for a pending system assist gesture (long-press home / corner swipe,
 * via KrishnaVoiceInteractionService) on mount and on window focus. When one
 * is pending, starts listening exactly like a mic tap in whichever mode is
 * currently active — the assist gesture IS the wake signal, so this never
 * gates on wake-word approval (mirrors tap-to-talk's `skipWakeWord`
 * semantics). No-ops on desktop/non-Android.
 */
export function useAssistTrigger(opts: UseAssistTriggerOpts): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!isMobileDevice()) return;
    let cancelled = false;

    const takePendingAssist = async () => {
      try {
        const pending = await invoke<boolean>("android_take_pending_assist");
        if (!pending || cancelled) return;
        const current = optsRef.current;
        if (current.isLiveMode) {
          if (!current.isLiveActive) current.startLive();
        } else {
          current.startClassicListening();
        }
      } catch {
        // Desktop stub / no pending assist — nothing to do.
      }
    };

    void takePendingAssist();

    let unlistenFocus: (() => void) | null = null;
    void (async () => {
      try {
        unlistenFocus = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
          if (focused) void takePendingAssist();
        });
      } catch {
        // Focus events unavailable — the mount-time check above still ran.
      }
    })();

    return () => {
      cancelled = true;
      unlistenFocus?.();
    };
    // Intentionally mount-once: reads live values via optsRef so callback
    // identity churn (e.g. useMobileSpeech's startListening) never tears
    // down and re-registers the focus listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
