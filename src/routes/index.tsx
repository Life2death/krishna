import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
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
} from "@/pages";
import { DashboardLayout } from "@/layouts";

export default function AppRoutes() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/presence" element={<Presence />} />
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
          {/* Redirect removed routes (merged in Phase 7) so stale persisted URLs don't render blank */}
          <Route path="/chats" element={<Navigate to="/dashboard" replace />} />
          <Route path="/responses" element={<Navigate to="/settings" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </Router>
  );
}
