/**
 * Phase 0: Brain WebSocket disabled. The brain is no longer in the critical
 * path, so there are no live push events to subscribe to. This hook is a
 * no-op placeholder; push notifications will be re-introduced in Phase 2
 * (cloud sync) via a different mechanism.
 */
export function useBrainWs(_domain: string, _onPush: () => void): void {}
