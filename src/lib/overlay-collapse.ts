/**
 * Collapse state for the main overlay window, held in module scope rather
 * than React context on purpose.
 *
 * `useWindowResize`'s `resizeWindow` is a `useCallback(…, [])` that closes
 * over nothing, and the two things that call it most aggressively — a
 * `MutationObserver` on `document.body` and a `mouseup` timer — are plain DOM
 * closures living outside React's tree entirely. Reading a module-scoped
 * value from inside them is always current and needs no re-subscription; a
 * context value would require refs plus tearing down and rebuilding the
 * observer on every change. `resizeWindow` is also prop-threaded into
 * `speech/index.tsx` and `speech/Header.tsx`, which a context refactor would
 * ripple into.
 *
 * Rust holds the authoritative flag (`OVERLAY_COLLAPSED` in window.rs) — this
 * mirror exists so the frontend can render the right thing and skip pointless
 * IPC, not as the source of truth.
 */

let collapsed = false;
const listeners = new Set<() => void>();

export const isOverlayCollapsed = () => collapsed;

export const setOverlayCollapsedLocal = (value: boolean) => {
  if (value === collapsed) return;
  collapsed = value;
  listeners.forEach((listener) => listener());
};

export const subscribeOverlayCollapsed = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
