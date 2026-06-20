import type { FastifyInstance } from "fastify";
import type { BrainContext } from "../context.ts";

interface DeviceHeartbeat {
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion?: string;
}

export function devicesRoutes(app: FastifyInstance, ctx: BrainContext): void {
  /**
   * POST /devices/heartbeat — register or refresh a device's presence.
   * Returns the server timestamp so the client can measure clock skew.
   */
  app.post("/devices/heartbeat", async (req) => {
    const { deviceId, deviceName, platform, appVersion } = req.body as DeviceHeartbeat;
    if (!deviceId || !deviceName) {
      return { error: "deviceId and deviceName are required" };
    }

    const now = Date.now();

    await ctx.db.execute({
      sql: `INSERT INTO devices (id, device_name, platform, last_seen, is_active, app_version)
            VALUES (?, ?, ?, ?, 1, ?)
            ON CONFLICT(id) DO UPDATE SET
              device_name = excluded.device_name,
              platform = excluded.platform,
              last_seen = excluded.last_seen,
              is_active = 1,
              app_version = excluded.app_version`,
      args: [deviceId, deviceName, platform || "unknown", now, appVersion || null],
    });

    return { ok: true, serverTime: now };
  });

  /**
   * GET /devices — list all active devices (seen within the last 5 minutes).
   */
  app.get("/devices", async () => {
    const cutoff = Date.now() - 5 * 60 * 1000;
    const rows = await ctx.db.execute({
      sql: "SELECT id, device_name, platform, last_seen, app_version FROM devices WHERE last_seen > ? ORDER BY last_seen DESC",
      args: [cutoff],
    });
    return rows.rows;
  });

  /**
   * DELETE /devices/:id — mark a device as inactive (on explicit logout).
   */
  app.delete("/devices/:id", async (req) => {
    const id = (req.params as { id: string }).id;
    await ctx.db.execute({
      sql: "UPDATE devices SET is_active = 0 WHERE id = ?",
      args: [id],
    });
    return { ok: true };
  });
}
