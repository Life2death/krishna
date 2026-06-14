import React from "react";
import ReactDOM from "react-dom/client";
import Overlay from "./components/Overlay";
import { AppProvider, ThemeProvider, ExpandedLayoutProvider, KrishnaProvider } from "./contexts";
import "./global.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AppRoutes from "./routes";

const currentWindow = getCurrentWindow();
const windowLabel = currentWindow.label;

if (windowLabel.startsWith("capture-overlay-")) {
  const monitorIndex = parseInt(windowLabel.split("-")[2], 10) || 0;
  // Render overlay without providers
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Overlay monitorIndex={monitorIndex} />
    </React.StrictMode>
  );
} else {
  // NOTE: StrictMode intentionally omitted here. React StrictMode double-invokes
  // effects in dev, which races vad-react@0.0.36's setup/cleanup and makes
  // useMicVAD destroy() a half-initialized instance, surfacing the spurious
  // "MicVAD has null stream, audio context, or processor adapter" error.
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
