import { useEffect } from "react";

/**
 * Phase 0: Device presence registration disabled. The brain is no longer in
 * the critical path, so device heartbeats are not needed. Re-introduced in
 * Phase 2 (cloud sync) if cross-device presence is required.
 */
export function useDevicePresence(): void {
  useEffect(() => {
    // No-op: presence registration is brain-dependent.
  }, []);
}
