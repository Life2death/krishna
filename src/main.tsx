import React from "react";
import ReactDOM from "react-dom/client";
import Overlay from "./components/Overlay";
import { AppProvider, ThemeProvider, ExpandedLayoutProvider, KrishnaProvider } from "./contexts";
import "./global.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AppRoutes from "./routes";
import { initializeCore } from "./lib/startup";

const currentWindow = getCurrentWindow();
const windowLabel = currentWindow.label;

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
      <ThemeProvider defaultTheme="light">
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
