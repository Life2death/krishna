import { getDatabase } from "./driver";
import type { RouteWatch, RouteWatchStatus } from "../types/route-watch";

interface DbRouteWatch {
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
  status: string;
  created_at: number;
}

function toRouteWatch(row: DbRouteWatch): RouteWatch {
  return {
    id: row.id,
    origin: row.origin,
    destination: row.destination,
    mode: row.mode,
    threshold_minutes: row.threshold_minutes,
    interval_minutes: row.interval_minutes,
    expires_at: row.expires_at,
    last_checked_at: row.last_checked_at,
    last_duration_minutes: row.last_duration_minutes,
    consecutive_failures: row.consecutive_failures,
    status: row.status as RouteWatchStatus,
    created_at: row.created_at,
  };
}

export async function createRouteWatch(watch: RouteWatch): Promise<RouteWatch> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO route_watches (id, origin, destination, mode, threshold_minutes, interval_minutes, expires_at, last_checked_at, last_duration_minutes, consecutive_failures, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [watch.id, watch.origin, watch.destination, watch.mode, watch.threshold_minutes, watch.interval_minutes, watch.expires_at, watch.last_checked_at, watch.last_duration_minutes, watch.consecutive_failures, watch.status, watch.created_at],
  );
  return watch;
}

export async function getActiveRouteWatch(): Promise<RouteWatch | null> {
  const db = await getDatabase();
  const rows = await db.select<DbRouteWatch[]>(
    "SELECT * FROM route_watches WHERE status = 'active' ORDER BY created_at DESC LIMIT 1",
  );
  return rows.length > 0 ? toRouteWatch(rows[0]) : null;
}

export async function cancelRouteWatch(id: string): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.execute(
    "UPDATE route_watches SET status = 'cancelled' WHERE id = ? AND status = 'active'",
    [id],
  );
  return result.rowsAffected > 0;
}

export async function updateRouteWatch(
  id: string,
  updates: {
    last_checked_at?: number;
    last_duration_minutes?: number | null;
    consecutive_failures?: number;
    status?: RouteWatchStatus;
  },
): Promise<boolean> {
  const db = await getDatabase();
  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = ?`);
    values.push(value);
  }

  if (setClauses.length === 0) return false;

  values.push(id);
  const result = await db.execute(
    `UPDATE route_watches SET ${setClauses.join(", ")} WHERE id = ?`,
    values,
  );
  return result.rowsAffected > 0;
}

export async function getRouteWatch(id: string): Promise<RouteWatch | null> {
  const db = await getDatabase();
  const rows = await db.select<DbRouteWatch[]>(
    "SELECT * FROM route_watches WHERE id = ?",
    [id],
  );
  return rows.length > 0 ? toRouteWatch(rows[0]) : null;
}
