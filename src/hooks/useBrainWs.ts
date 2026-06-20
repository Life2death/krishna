import { useEffect, useRef, useCallback } from "react";
import { readBrainConfig } from "@/lib/remote";
import type { PushOp } from "@/lib/remote/remote-client";

type PushMessage = {
  domain: string;
  op: PushOp;
  row: unknown;
};

type Subscriber = (msg: PushMessage) => void;

const subscribers = new Map<string, Set<Subscriber>>();
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let refCount = 0;

function connect() {
  const config = readBrainConfig();
  if (config.brainMode !== "remote" || !config.brainUrl || !config.brainToken) return;

  const url = config.brainUrl.replace(/\/+$/, "");
  const wsUrl = `${url.replace(/^http/, "ws")}/ws?token=${encodeURIComponent(config.brainToken)}`;

  try {
    ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as PushMessage;
        const domainSubs = subscribers.get(msg.domain);
        if (domainSubs) {
          for (const cb of domainSubs) {
            cb(msg);
          }
        }
      } catch {
        // ignore malformed messages
      }
    };
    ws.onclose = () => {
      ws = null;
      if (refCount > 0 && subscribers.size > 0) {
        reconnectTimer = setTimeout(connect, 3000);
      }
    };
    ws.onerror = () => {
      ws?.close();
    };
  } catch {
    // connection failed, retry later
    if (refCount > 0) {
      reconnectTimer = setTimeout(connect, 5000);
    }
  }
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

/**
 * Hook that subscribes to brain WebSocket push events for a specific domain.
 * When a push arrives, it calls the provided callback (typically a hook's fetch* refresher).
 * Automatically connects when the first subscriber appears and disconnects on cleanup.
 */
export function useBrainWs(domain: string, onPush: () => void): void {
  const stableCb = useRef(onPush);
  stableCb.current = onPush;

  useEffect(() => {
    const handler = (_msg: PushMessage) => {
      stableCb.current();
    };

    if (!subscribers.has(domain)) {
      subscribers.set(domain, new Set());
    }
    subscribers.get(domain)!.add(handler);
    refCount++;

    if (!ws) {
      connect();
    }

    return () => {
      const set = subscribers.get(domain);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          subscribers.delete(domain);
        }
      }
      refCount--;
      if (refCount === 0) {
        disconnect();
      }
    };
  }, [domain]);
}
