import React from "react";
import ReactDOM from "react-dom/client";
import Overlay from "./components/Overlay";
import PresenceOverlay from "./components/PresenceOverlay";
import { AppProvider, ThemeProvider, ExpandedLayoutProvider, KrishnaProvider } from "./contexts";
import "./global.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AppRoutes from "./routes";
import { initializeCore } from "./lib/startup";

// Android WebView lacks the Web Speech API (window.speechSynthesis is undefined).
// Shim it so TTS calls (getVoices/speak/cancel) no-op instead of throwing and
// crashing the React tree (white screen). TTS just stays silent on Android.
if (typeof (window as any).speechSynthesis === "undefined") {
  (window as any).speechSynthesis = {
    getVoices: () => [],
    speak: () => {},
    cancel: () => {},
    pause: () => {},
    resume: () => {},
    speaking: false,
    paused: false,
    pending: false,
    onvoiceschanged: null,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

const currentWindow = getCurrentWindow();
const windowLabel = currentWindow.label;

if (windowLabel === "presence") {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <PresenceOverlay />
    </React.StrictMode>
  );
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
