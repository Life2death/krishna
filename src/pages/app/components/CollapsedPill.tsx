import { useCallback, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { KrishnaChakra, type ChakraState } from "@/components";
import type { VoiceState } from "@/lib/voice-state";

interface CollapsedPillProps {
  state: VoiceState;
  /** Called on a genuine double-click (no drag in between) or Enter/Space. */
  onExpand: () => void;
}

const DRAG_THRESHOLD_PX = 4;
const DOUBLE_CLICK_WINDOW_MS = 350;

const STATE_LABEL: Record<VoiceState, string> = {
  idle: "Krishna (double-click to open)",
  listening: "Krishna is listening (double-click to open)",
  thinking: "Krishna is thinking (double-click to open)",
  speaking: "Krishna is speaking (double-click to open)",
};

// Tailwind utility per state — applied plain on the wrapper (so the pulse
// ring picks it up via `ring-current`/inheritance) and with a `!` prefix
// into KrishnaChakra's className (`.krishna-chakra` sets its own `color`
// directly, so only an !important override actually wins there).
const STATE_TEXT_CLASS: Record<VoiceState, string> = {
  idle: "text-muted-foreground",
  listening: "text-emerald-500",
  thinking: "text-amber-500",
  speaking: "text-primary",
};

const toChakraState = (state: VoiceState): ChakraState =>
  state === "thinking" ? "processing" : state;

/**
 * The 106x106 collapsed overlay icon. Reuses KrishnaChakra rather than drawing
 * a new SVG, keeping the state color while the disc spins continuously until
 * Krishna speaks, when the live waveform takes over.
 *
 * Deliberately NOT `data-tauri-drag-region` — Windows treats a drag region as
 * a caption area and swallows the double-click as a maximize toggle, and
 * useWindow.ts's global mousedown handler keys off exactly that attribute
 * (which would force a resize meant for the expanded bar). Drag is handled
 * manually via startDragging(), and expand via a hand-rolled click counter —
 * once startDragging() hands the mouse loop to the OS mid-gesture, the
 * webview stops seeing move/up, which desyncs the browser's own dblclick
 * bookkeeping.
 */
export const CollapsedPill = ({ state, onExpand }: CollapsedPillProps) => {
  const movedRef = useRef(false);
  const originRef = useRef({ x: 0, y: 0 });
  const lastClickAtRef = useRef(0);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    movedRef.current = false;
    originRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (movedRef.current || e.buttons !== 1) return;
    const dx = e.clientX - originRef.current.x;
    const dy = e.clientY - originRef.current.y;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      movedRef.current = true;
      getCurrentWebviewWindow()
        .startDragging()
        .catch(() => {
          // Best-effort — a failed drag start shouldn't break the click path.
        });
    }
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      if (movedRef.current) {
        movedRef.current = false;
        return;
      }
      const now = performance.now();
      if (now - lastClickAtRef.current < DOUBLE_CLICK_WINDOW_MS) {
        lastClickAtRef.current = 0;
        onExpand();
      } else {
        lastClickAtRef.current = now;
      }
    },
    [onExpand]
  );

  const handlePointerCancel = useCallback(() => {
    movedRef.current = false;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onExpand();
      }
    },
    [onExpand]
  );

  const colorClass = STATE_TEXT_CLASS[state];
  return (
    <button
      type="button"
      aria-label={STATE_LABEL[state]}
      title={STATE_LABEL[state]}
      className={`flex h-[106px] w-[106px] shrink-0 cursor-pointer items-center justify-center ${colorClass}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
    >
      {state === "speaking" ? (
        <span className="krishna-pill-bars" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </span>
      ) : (
        <KrishnaChakra
          state={toChakraState(state)}
          size={58}
          minimal
          className={`krishna-chakra--compact !${colorClass}`}
        />
      )}
    </button>
  );
};
