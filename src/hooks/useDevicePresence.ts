import { useEffect, useRef } from "react";
import { readBrainConfig } from "../lib/remote/remote-client";
import { getPlatform } from "../lib/platform";

/**
 * Registers this device with the brain and sends periodic heartbeats.
 * Only active when brainMode === "remote".
 */
export function useDevicePresence(): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const config = readBrainConfig();
    if (config.brainMode !== "remote" || !config.brainUrl || !config.brainToken) return;

    const baseUrl = config.brainUrl.replace(/\/+$/, "");

    // Generate a stable device ID from localStorage
    const storageKey = "krishna_device_id";
    let deviceId = localStorage.getItem(storageKey);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(storageKey, deviceId);
    }

    const deviceName = `Krishna (${getPlatform()})`;
    const platform = getPlatform();

    const sendHeartbeat = async () => {
      try {
        await fetch(`${baseUrl}/devices/heartbeat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.brainToken}`,
          },
          body: JSON.stringify({ deviceId, deviceName, platform }),
        });
      } catch {
        // Silently ignore — brain may be temporarily unreachable
      }
    };

    // Send immediately, then every 60s
    sendHeartbeat();
    intervalRef.current = setInterval(sendHeartbeat, 60_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);
}
