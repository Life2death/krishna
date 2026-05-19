import React from "react";
import ReactDOM from "react-dom/client";
import Overlay from "./components/Overlay";
import { AppProvider, ThemeProvider, ExpandedLayoutProvider } from "./contexts";
import "./global.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AppRoutes from "./routes";

const currentWindow = getCurrentWindow();
const windowLabel = currentWindow.label;

// Render different components based on window label
const isTeleprompter = windowLabel === "teleprompter";

if (isTeleprompter) {
  // Teleprompter window: minimal shell, no AppProvider (no SQL, no audio)
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider defaultTheme="light">
        <AppRoutes />
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
