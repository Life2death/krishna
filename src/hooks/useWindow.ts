import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useCallback, useEffect } from "react";
import { isOverlayCollapsed } from "@/lib/overlay-collapse";

// Helper function to check if any popover is open in the DOM
export const isAnyPopoverOpen = (): boolean => {
  const popoverContents = document.querySelectorAll(
    "[data-radix-popper-content-wrapper]"
  );
  return popoverContents.length > 0;
};

export const useWindowResize = () => {
  const resizeWindow = useCallback(async (expanded: boolean) => {
    try {
      // While collapsed, the pill owns the window geometry — every height
      // resize meant for the expanded bar must be a no-op or it snaps the
      // window back to 600 wide. Rust enforces this too (the real safety
      // net, since the observer below can call in from outside React); this
      // guard just avoids the pointless IPC round-trip.
      if (isOverlayCollapsed()) {
        return;
      }

      const window = getCurrentWebviewWindow();

      if (!expanded && isAnyPopoverOpen()) {
        return;
      }

      const newHeight = expanded ? 600 : 54;

      await invoke("set_window_height", {
        window,
        height: newHeight,
      });
    } catch (error) {
      console.error("Failed to resize window:", error);
    }
  }, []);

  // Setup drag handling and popover monitoring
  useEffect(() => {
    let isDragging = false;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isDragRegion = target.closest('[data-tauri-drag-region="true"]');

      if (isDragRegion) {
        isDragging = true;
      }
    };

    const handleMouseUp = async () => {
      if (isDragging) {
        isDragging = false;

        setTimeout(() => {
          // Read the collapse flag inside the timeout, not outside — a
          // collapse that starts during this 100ms window still wins.
          if (!isOverlayCollapsed() && !isAnyPopoverOpen()) {
            resizeWindow(false);
          }
        }, 100);
      }
    };

    const observer = new MutationObserver(() => {
      if (!isOverlayCollapsed() && !isAnyPopoverOpen()) {
        resizeWindow(false);
      }
    });

    // Observe the body for changes to detect popover open/close
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
      observer.disconnect();
    };
  }, [resizeWindow]);

  return { resizeWindow };
};

interface UseWindowFocusOptions {
  onFocusLost?: () => void;
  onFocusGained?: () => void;
}

export const useWindowFocus = ({
  onFocusLost,
  onFocusGained,
}: UseWindowFocusOptions = {}) => {
  const handleFocusChange = useCallback(
    async (focused: boolean) => {
      if (focused && onFocusGained) {
        onFocusGained();
      } else if (!focused && onFocusLost) {
        onFocusLost();
      }
    },
    [onFocusLost, onFocusGained]
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupFocusListener = async () => {
      try {
        const window = getCurrentWebviewWindow();

        // Listen to focus change events
        unlisten = await window.onFocusChanged(({ payload: focused }) => {
          handleFocusChange(focused);
        });
      } catch (error) {
        console.error("Failed to setup focus listener:", error);
      }
    };

    setupFocusListener();

    // Cleanup
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleFocusChange]);
};
