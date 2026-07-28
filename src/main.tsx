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
