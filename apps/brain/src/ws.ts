import type { WebSocket } from "@fastify/websocket";

export type PushOp = "create" | "save" | "delete" | "deleteAll" | "append";

/**
 * Tiny broadcast hub. Every mutation pushes `{domain, op, row}` to all connected
 * clients so they can refresh the affected hook state (Phase 2 live sync).
 */
export class Hub {
  private sockets = new Set<WebSocket>();

  add(ws: WebSocket): void {
    this.sockets.add(ws);
    ws.on("close", () => this.sockets.delete(ws));
    ws.on("error", () => this.sockets.delete(ws));
  }

  broadcast(domain: string, op: PushOp, row: unknown): void {
    const msg = JSON.stringify({ domain, op, row });
    for (const ws of this.sockets) {
      try {
        ws.send(msg);
      } catch {
        this.sockets.delete(ws);
      }
    }
  }

  get size(): number {
    return this.sockets.size;
  }
}
