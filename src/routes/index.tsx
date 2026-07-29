import { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from "react-router-dom";
import {
  Dashboard,
  Status,
  App,
  SystemPrompts,
  ViewChat,
  Settings,
  DevSpace,
  Shortcuts,
  Audio,
  Screenshot,
  Setup,
  MobileMemories,
  MobileHome,
  MobileSettings,
  Upgrades,
} from "@/pages";
import { DashboardLayout } from "@/layouts";
import { invoke } from "@tauri-apps/api/core";
import { hasSealedKey, sealMasterKey } from "@/lib/secure-storage";
import { isMobileDevice } from "@/lib/platform";

function FirstRunGuard() {
  const [checking, setChecking] = useState(true);
  const [isFirstRun, setIsFirstRun] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Mobile: best-effort KeyStore seal. Must NEVER throw into the first-run
        // check — if the KeyStore JNI is unavailable, secure storage falls back to
        // a device-bound key, and we must still read the saved token below (else
        // the app loops back to setup forever).
        const sealed = await hasSealedKey();
        if (!sealed) {
          try {
            await sealMasterKey();
          } catch {
            /* seal unavailable — secure storage falls back to a device key */
          }
        }

        const token = await invoke<string | null>("secure_get", { key: "KRISHNA_BRAIN_TOKEN" });
        setIsFirstRun(!token);
      } catch {
        setIsFirstRun(true);
      }
      setChecking(false);
    })();
  }, []);

  if (checking) return null;
  if (isFirstRun) return <Navigate to="/setup" replace />;
  return <Outlet />;
}

export default function AppRoutes() {
  return (
    <Router>
      <Routes>
        <Route path="/setup" element={<Setup />} />
        {isMobileDevice() ? (
          // Mobile: one screen — a big tap-to-talk button. Setup-gated so a
          // fresh install still runs the wizard first.
          <Route element={<FirstRunGuard />}>
            <Route path="/" element={<MobileHome />} />
            <Route path="/mobile/settings" element={<MobileSettings />} />
            <Route path="/mobile/settings/upgrades" element={<Upgrades />} />
            <Route path="/mobile/memories" element={<MobileMemories />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        ) : (
          <>
            <Route path="/" element={<App />} />
            <Route element={<FirstRunGuard />}>
              <Route element={<DashboardLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/status" element={<Status />} />
                <Route path="/system-prompts" element={<SystemPrompts />} />
                <Route path="/chats/view/:conversationId" element={<ViewChat />} />
                <Route path="/shortcuts" element={<Shortcuts />} />
                <Route path="/screenshot" element={<Screenshot />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/settings/upgrades" element={<Upgrades />} />
                <Route path="/audio" element={<Audio />} />
                <Route path="/dev-space" element={<DevSpace />} />
                <Route path="/mobile/memories" element={<MobileMemories />} />
                <Route path="/chats" element={<Navigate to="/dashboard" replace />} />
                <Route path="/responses" element={<Navigate to="/settings" replace />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Route>
          </>
        )}
      </Routes>
    </Router>
  );
}
