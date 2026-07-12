import {
  getPendingDeviceCommands,
  completeDeviceCommand,
  type DeviceKind,
} from "@krishna/core/database";
import { isMobileDevice } from "@/lib/platform";

const POLL_MS = 15_000;
// Ignore commands older than this — replaying an hours-old "open X" when the
// phone finally comes online is more surprising than helpful.
const MAX_AGE_MS = 30 * 60_000;

/**
 * Device-command dispatcher (bridge P1): polls the synced `device_commands`
 * table for pending rows addressed to THIS device kind and feeds them into the
 * normal voice-command pipeline, so a relayed command behaves exactly as if it
 * had been spoken to this device directly (local location, local apps).
 *
 * Rows are marked done BEFORE execution — if two devices of the same kind ever
 * share a sync hub, or the app restarts mid-run, a command must never fire
 * twice (opening an app twice is annoying; sending a message twice is worse).
 */
export function startDeviceCommandDispatcher(
  processCommand: (text: string) => Promise<void>,
): () => void {
  const myKind: DeviceKind = isMobileDevice() ? "mobile" : "desktop";
  const inFlight = new Set<string>();

  const tick = async () => {
    let pending;
    try {
      pending = await getPendingDeviceCommands(myKind, Date.now() - MAX_AGE_MS);
    } catch {
      return; // DB not ready yet (startup race) — next tick will retry.
    }
    for (const cmd of pending) {
      if (inFlight.has(cmd.id)) continue;
      inFlight.add(cmd.id);
      try {
        await completeDeviceCommand(cmd.id, "done", "(executing)");
        try {
          await processCommand(cmd.command_text);
          await completeDeviceCommand(cmd.id, "done", "executed");
        } catch (e) {
          await completeDeviceCommand(
            cmd.id,
            "failed",
            e instanceof Error ? e.message : String(e),
          );
        }
      } catch (e) {
        console.error("[device-relay] dispatch failed:", e);
      } finally {
        inFlight.delete(cmd.id);
      }
    }
  };

  const timer = setInterval(tick, POLL_MS);
  void tick();
  return () => clearInterval(timer);
}
