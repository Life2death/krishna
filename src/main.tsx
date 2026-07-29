import React from "react";
import ReactDOM from "react-dom/client";
import Overlay from "./components/Overlay";
import { AppProvider, ThemeProvider, ExpandedLayoutProvider, KrishnaProvider } from "./contexts";
import "./global.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import AppRoutes from "./routes";
import { initializeCore } from "./lib/startup";
import { setOverlayCollapsedLocal } from "./lib/overlay-collapse";

const currentWindow = getCurrentWindow();
const windowLabel = currentWindow.label;

// The overlay window (label "main") boots at its tauri.conf.json size
// (600x54) and hidden — resizing it during Rust's setup runs before WebView2
// exists, so the OS window moves but the content keeps rendering at the
// config size (tauri-apps/tauri#10053, #13318 — confirmed live). Collapsing
// here, before React even mounts, means it never waits on initializeCore()
// (which can legitimately take longer than Rust's 5s fallback-show timer,
// which was the actual cause of an earlier boot race where the fallback beat
// this collapse to the punch). Only for the actual overlay — capture-overlay
// and any other window label must not be resized/shown from here.
if (windowLabel === "main" || windowLabel === "krishna") {
  invoke("set_overlay_collapsed", { collapsed: true })
    .then(() => setOverlayCollapsedLocal(true))
    .catch((error) => console.error("[overlay] Initial collapse failed:", error))
    .finally(() => {
      currentWindow.show().catch((error) => console.error("[overlay] Failed to show window:", error));
    });
}

const renderApp = () => {
  if (windowLabel.startsWith("capture-overlay-")) {
    const monitorIndex = parseInt(windowLabel.split("-")[2], 10) || 0;
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <Overlay monitorIndex={monitorIndex} />
      </React.StrictMode>
    );
  } else {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <ThemeProvider defaultTheme="dark">
        <AppProvider>
          <ExpandedLayoutProvider>
            <KrishnaProvider>
              <AppRoutes />
            </KrishnaProvider>
          </ExpandedLayoutProvider>
        </AppProvider>
      </ThemeProvider>
    );
  }
};

// Render the app once core init settles. A hung or failed startup step must
// NEVER leave a blank white screen — if init doesn't resolve within 12s, or
// it rejects, render anyway (the app degrades gracefully; providers re-read
// state) rather than trapping the user on an empty page.
let rendered = false;
const renderOnce = (why: string) => {
  if (rendered) return;
  rendered = true;
  (window as unknown as { __bootRender?: string }).__bootRender = why;
  renderApp();
};

const watchdog = setTimeout(() => {
  console.error("[boot] init watchdog fired at step:", (window as unknown as { __bootStep?: string }).__bootStep);
  renderOnce("watchdog");
}, 12000);

initializeCore()
  .then(() => { clearTimeout(watchdog); renderOnce("init-ok"); })
  .catch((err) => {
    clearTimeout(watchdog);
    console.error("[boot] initializeCore failed:", err);
    renderOnce("init-error");
  });
