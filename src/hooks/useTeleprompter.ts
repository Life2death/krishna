import { useCallback, useEffect, useState } from "react";
import {
  WebviewWindow,
  getCurrentWebviewWindow,
} from "@tauri-apps/api/webviewWindow";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import {
  TELEPROMPTER_CLEAR_EVENT,
  TELEPROMPTER_EVENT,
} from "@/config";

const TELEPROMPTER_LABEL = "teleprompter";
const DEFAULT_WIDTH = 700;
const DEFAULT_HEIGHT = 110;
const TOP_OFFSET = 8; // px from screen top

async function findTeleprompterWindow(): Promise<WebviewWindow | null> {
  try {
    return await WebviewWindow.getByLabel(TELEPROMPTER_LABEL);
  } catch {
    return null;
  }
}

/**
 * Open or focus the floating teleprompter window. The window is positioned
 * at the top-centre of the primary monitor — as close to the webcam as
 * practical so reading-gaze deviation is minimised.
 */
export async function openTeleprompterWindow(): Promise<void> {
  const existing = await findTeleprompterWindow();
  if (existing) {
    try {
      await existing.show();
      await existing.setFocus();
    } catch {}
    return;
  }

  // Compute centered top position based on primary monitor
  let x = 200;
  let y = TOP_OFFSET;
  try {
    const monitor = await currentMonitor();
    if (monitor) {
      const scale = monitor.scaleFactor || 1;
      const logicalWidth = monitor.size.width / scale;
      x = Math.max(0, Math.round((logicalWidth - DEFAULT_WIDTH) / 2));
      y = TOP_OFFSET;
    }
  } catch {}

  const win = new WebviewWindow(TELEPROMPTER_LABEL, {
    url: "index.html",
    title: "Reading Mode",
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    x,
    y,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    visible: true,
    focus: false,
    shadow: false,
    minWidth: 320,
    minHeight: 60,
  });

  // Surface any creation error to the console — the window also fires
  // tauri://error if URL/permissions are off.
  win.once("tauri://error", (e) => {
    console.error("Teleprompter window error:", e);
  });
}

export async function closeTeleprompterWindow(): Promise<void> {
  const existing = await findTeleprompterWindow();
  if (!existing) return;
  try {
    await existing.close();
  } catch {}
}

export async function isTeleprompterOpen(): Promise<boolean> {
  return (await findTeleprompterWindow()) !== null;
}

/** Push a new full-answer string to the teleprompter (idempotent). */
export async function pushTeleprompterText(text: string): Promise<void> {
  try {
    await emit(TELEPROMPTER_EVENT, { text, at: Date.now() });
  } catch {}
}

/** Tell the teleprompter to clear its current text. */
export async function clearTeleprompterText(): Promise<void> {
  try {
    await emit(TELEPROMPTER_CLEAR_EVENT, {});
  } catch {}
}

export async function repositionTeleprompterAtTop(): Promise<void> {
  const win = await findTeleprompterWindow();
  if (!win) return;
  try {
    const monitor = await currentMonitor();
    if (!monitor) return;
    const scale = monitor.scaleFactor || 1;
    const logicalWidth = monitor.size.width / scale;
    const size = await win.outerSize();
    const winW = size.width / scale;
    const x = Math.max(0, Math.round((logicalWidth - winW) / 2));
    await win.setPosition(new LogicalPosition(x, TOP_OFFSET));
  } catch {}
}

export async function resizeTeleprompter(
  width: number,
  height: number
): Promise<void> {
  const win = await findTeleprompterWindow();
  if (!win) return;
  try {
    await win.setSize(new LogicalSize(width, height));
  } catch {}
}

/**
 * React hook for components inside the *teleprompter* window to know which
 * window they're in. Useful for conditional rendering in main.tsx.
 */
export function useIsTeleprompterWindow(): boolean {
  const [is, setIs] = useState(false);
  useEffect(() => {
    try {
      const w = getCurrentWebviewWindow();
      setIs(w.label === TELEPROMPTER_LABEL);
    } catch {
      setIs(false);
    }
  }, []);
  return is;
}

/**
 * React hook bundling the open/close/toggle operations that components on
 * the main app side use.
 */
export function useTeleprompterController() {
  const [isOpen, setIsOpen] = useState(false);

  const refresh = useCallback(async () => {
    setIsOpen(await isTeleprompterOpen());
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 1500);
    return () => window.clearInterval(id);
  }, [refresh]);

  const open = useCallback(async () => {
    await openTeleprompterWindow();
    await refresh();
  }, [refresh]);

  const close = useCallback(async () => {
    await closeTeleprompterWindow();
    await refresh();
  }, [refresh]);

  const toggle = useCallback(async () => {
    if (await isTeleprompterOpen()) await close();
    else await open();
  }, [open, close]);

  return { isOpen, open, close, toggle };
}
