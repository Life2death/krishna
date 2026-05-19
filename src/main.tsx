import React from "react";
import ReactDOM from "react-dom/client";
import Overlay from "./components/Overlay";
import Teleprompter from "./pages/teleprompter";
import { AppProvider, ThemeProvider, ExpandedLayoutProvider } from "./contexts";
import "./global.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AppRoutes from "./routes";

const currentWindow = getCurrentWindow();
const windowLabel = currentWindow.label;

// Render different components based on window label. All Tauri webview
// windows load the same index.html, so dispatching here keeps the bundle
// shared while letting each window mount its own component subtree.
const isTeleprompter = windowLabel === "teleprompter";

if (isTeleprompter) {
  // Teleprompter window — direct render, no router, no AppProvider
  // (no SQL/audio/etc. needed in the overlay). The Tauri event bus
  // delivers streamed answer text from the main window.
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider defaultTheme="light">
        <Teleprompter />
      </ThemeProvider>
    </React.StrictMode>
  );
} else if (windowLabel.startsWith("capture-overlay-")) {
  const monitorIndex = parseInt(windowLabel.split("-")[2], 10) || 0;
  // Render overlay without providers
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Overlay monitorIndex={monitorIndex} />
    </React.StrictMode>
  );
} else {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider defaultTheme="light">
        <AppProvider>
          <ExpandedLayoutProvider>
            <AppRoutes />
          </ExpandedLayoutProvider>
        </AppProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}
