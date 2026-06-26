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
  Presence,
  Setup,
} from "@/pages";
import { DashboardLayout } from "@/layouts";
import { invoke } from "@tauri-apps/api/core";

function FirstRunGuard() {
  const [checking, setChecking] = useState(true);
  const [isFirstRun, setIsFirstRun] = useState(false);

  useEffect(() => {
    (async () => {
      try {
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
        <Route path="/" element={<App />} />
        <Route path="/presence" element={<Presence />} />
        <Route path="/setup" element={<Setup />} />
        <Route element={<FirstRunGuard />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/status" element={<Status />} />
            <Route path="/system-prompts" element={<SystemPrompts />} />
            <Route path="/chats/view/:conversationId" element={<ViewChat />} />
            <Route path="/shortcuts" element={<Shortcuts />} />
            <Route path="/screenshot" element={<Screenshot />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/audio" element={<Audio />} />
            <Route path="/dev-space" element={<DevSpace />} />
            <Route path="/chats" element={<Navigate to="/dashboard" replace />} />
            <Route path="/responses" element={<Navigate to="/settings" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}
