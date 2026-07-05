export type RouteWatchStatus = "active" | "triggered" | "expired" | "cancelled";

export interface RouteWatch {
  id: string;
  origin: string;
  destination: string;
  mode: string;
  threshold_minutes: number;
  interval_minutes: number;
  expires_at: number;
  last_checked_at: number | null;
  last_duration_minutes: number | null;
  consecutive_failures: number;
  status: RouteWatchStatus;
  created_at: number;
}
