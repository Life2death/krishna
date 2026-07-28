import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  isOverlayCollapsed,
  setOverlayCollapsedLocal,
  subscribeOverlayCollapsed,
} from "@/lib/overlay-collapse";

/** Matches the CSS transition on the bar in `pages/app/index.tsx`. */
const COLLAPSE_ANIMATION_MS = 180;

/**
 * Owns collapsing/expanding the overlay window.
 *
 * The window boots at its `tauri.conf.json` size (600x106) and hidden, then
 * this hook collapses it to the pill and reveals it on mount. That ordering is
 * load-bearing: resizing during Rust's `setup_main_window` moves the OS window
 * but leaves WebView2 rendering at the config size (tauri-apps/tauri#10053,
 * #13318 — confirmed live: `outer_size()` reported 106x106 while the content
 * still painted the full bar). The identical resize at runtime works, which is
 * why the popovers' `set_window_height` has always been fine.
 *
 * Mount this exactly once, in the overlay's root component.
 */
export const useOverlayCollapse = () => {
  const collapsed = useSyncExternalStore(
    subscribeOverlayCollapsed,
    isOverlayCollapsed,
    // Server snapshot — the overlay never SSRs, but useSyncExternalStore
    // wants this for the initial render path.
    isOverlayCollapsed
  );

  // Serializes collapse/expand so a fast double-click racing an auto-collapse
  // can't interleave two geometry changes.
  const inFlightRef = useRef<Promise<void> | null>(null);

  const run = useCallback(async (next: boolean) => {
    const previous = inFlightRef.current;
    const task = (async () => {
      if (previous) await previous.catch(() => {});
      if (isOverlayCollapsed() === next) return;

      try {
        if (next) {
          // Close any open popover first — Radix portals into document.body,
          // so one left open while the window shrinks to 106x106 would be
          // clipped to nothing. Deliberately does NOT consult
          // isAnyPopoverOpen() as a bail-out (unlike resizeWindow): a stuck
          // popover must not be able to pin the bar open forever.
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

          // Flip the flag first so the bar plays its CSS exit while the
          // window is still large, then shrink once that's done.
          setOverlayCollapsedLocal(true);
          await new Promise((resolve) => setTimeout(resolve, COLLAPSE_ANIMATION_MS));
          await invoke("set_overlay_collapsed", { collapsed: true });
        } else {
          // Grow the window first, so the bar animates in inside a window
          // that's already big enough to show it.
          await invoke("set_overlay_collapsed", { collapsed: false });
          setOverlayCollapsedLocal(false);
        }
      } catch (error) {
        console.error("[overlay] Failed to toggle collapse:", error);
        // Re-sync the mirror to whatever actually happened rather than
        // leaving the UI claiming a state the window isn't in.
        setOverlayCollapsedLocal(!next);
      }
    })();

    inFlightRef.current = task;
    return task;
  }, []);

  const collapse = useCallback(() => run(true), [run]);
  const expand = useCallback(() => run(false), [run]);

  // Boot collapsed, then reveal. Rust keeps the window hidden until now
  // (tauri.conf.json `visible: false`) so the full bar never flashes; it also
  // has a 5s fallback that shows the window if this never runs.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await invoke("set_overlay_collapsed", { collapsed: true });
        if (!cancelled) setOverlayCollapsedLocal(true);
      } catch (error) {
        console.error("[overlay] Initial collapse failed:", error);
      } finally {
        // Always reveal, even if collapsing failed — an unreachable invisible
        // window is far worse than one that opened at the wrong size.
        try {
          await getCurrentWebviewWindow().show();
        } catch (error) {
          console.error("[overlay] Failed to show window:", error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { collapsed, collapse, expand };
};
