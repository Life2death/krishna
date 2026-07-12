import React from "react";
import ReactDOM from "react-dom/client";
import Overlay from "./components/Overlay";
import PresenceOverlay from "./components/PresenceOverlay";
import { AppProvider, ThemeProvider, ExpandedLayoutProvider, KrishnaProvider } from "./contexts";
import "./global.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AppRoutes from "./routes";
import { initializeCore } from "./lib/startup";

const currentWindow = getCurrentWindow();
const windowLabel = currentWindow.label;

const isMobileUA =
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

if (windowLabel === "presence") {
  // The presence overlay is a desktop-only orb. On mobile the window still gets
  // created from the static tauri.conf.json config (and Rust closes it), but
  // until it's gone we must NOT mount PresenceOverlay — its animation loop and
  // timers would run pointlessly in a hidden WebView.
  if (!isMobileUA) {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <PresenceOverlay />
      </React.StrictMode>
    );
  }
} else {
  initializeCore().then(() => {
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
  });
}
