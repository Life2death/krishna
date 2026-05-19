/**
 * Teleprompter window — a small, always-on-top viewport rendered near the
 * top of the screen (so the user's reading gaze stays close to the webcam).
 * Renders only the latest AI answer, in a tight high-density font.
 */
import { useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  TELEPROMPTER_CLEAR_EVENT,
  TELEPROMPTER_EVENT,
} from "@/config";
import {
  getTeleprompterFontSize,
  getTeleprompterOpacity,
  setTeleprompterFontSize,
  setTeleprompterOpacity,
} from "@/lib";
import {
  MinusIcon,
  PlusIcon,
  XIcon,
  EyeIcon,
  GripHorizontalIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FONT_MIN = 10;
const FONT_MAX = 36;
const OP_MIN = 0.35;
const OP_MAX = 1.0;

const Teleprompter = () => {
  const [text, setText] = useState<string>("");
  const [fontSize, setFontSize] = useState<number>(() =>
    getTeleprompterFontSize()
  );
  const [opacity, setOpacity] = useState<number>(() =>
    getTeleprompterOpacity()
  );
  const [showControls, setShowControls] = useState<boolean>(true);
  const contentRef = useRef<HTMLDivElement>(null);

  // Listen for streamed answer updates from the main window
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    (async () => {
      const u1 = await listen<{ text: string }>(TELEPROMPTER_EVENT, (e) => {
        setText(e.payload?.text ?? "");
      });
      const u2 = await listen(TELEPROMPTER_CLEAR_EVENT, () => setText(""));
      unlisteners.push(u1, u2);
    })();
    return () => {
      unlisteners.forEach((u) => {
        try {
          u();
        } catch {}
      });
    };
  }, []);

  // Auto-scroll to bottom as new text streams in
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [text]);

  const handleClose = async () => {
    try {
      const win = getCurrentWebviewWindow();
      await win.close();
    } catch {}
  };

  const adjustFont = (delta: number) => {
    const next = Math.max(FONT_MIN, Math.min(FONT_MAX, fontSize + delta));
    setFontSize(next);
    setTeleprompterFontSize(next);
  };

  const adjustOpacity = (delta: number) => {
    const next = Math.max(OP_MIN, Math.min(OP_MAX, +(opacity + delta).toFixed(2)));
    setOpacity(next);
    setTeleprompterOpacity(next);
  };

  return (
    <div
      className={cn(
        "fixed inset-0 select-none text-foreground font-sans",
        "rounded-md border border-primary/40 shadow-lg overflow-hidden"
      )}
      style={{
        backgroundColor: `rgb(255 255 255 / ${opacity})`,
        color: "#0c2a4a",
      }}
    >
      {/* Drag handle / control bar */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between gap-2 px-2 py-1 border-b border-primary/20 bg-primary/8"
        onDoubleClick={() => setShowControls((s) => !s)}
      >
        <div
          data-tauri-drag-region
          className="flex items-center gap-1 text-[10px] font-medium text-primary/80 flex-1"
        >
          <GripHorizontalIcon className="h-3 w-3" />
          <span data-tauri-drag-region>Reading Mode · drag to move</span>
        </div>
        {showControls && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => adjustFont(-1)}
              title="Smaller text"
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-primary/15"
            >
              <MinusIcon className="h-3 w-3" />
            </button>
            <span className="text-[9px] font-mono w-5 text-center tabular-nums">
              {fontSize}
            </span>
            <button
              type="button"
              onClick={() => adjustFont(1)}
              title="Larger text"
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-primary/15"
            >
              <PlusIcon className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => adjustOpacity(-0.05)}
              title="More transparent"
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-primary/15 ml-1"
            >
              <EyeIcon className="h-3 w-3 opacity-60" />
            </button>
            <button
              type="button"
              onClick={() => adjustOpacity(0.05)}
              title="More opaque"
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-primary/15"
            >
              <EyeIcon className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              title="Close teleprompter"
              className="h-5 w-5 flex items-center justify-center rounded hover:bg-destructive/20 ml-1"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {/* Text content */}
      <div
        ref={contentRef}
        className="px-3 py-2 overflow-y-auto leading-snug"
        style={{
          fontSize: `${fontSize}px`,
          height: "calc(100% - 22px)",
        }}
      >
        {text ? (
          <p className="whitespace-pre-wrap break-words">{text}</p>
        ) : (
          <p className="text-muted-foreground italic" style={{ fontSize: 11 }}>
            Waiting for the next answer — ask a question in the main window.
          </p>
        )}
      </div>
    </div>
  );
};

export default Teleprompter;
