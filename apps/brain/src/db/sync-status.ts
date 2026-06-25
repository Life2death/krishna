import type { Client } from "@libsql/client";
import { config } from "../config.ts";

interface SyncState {
  enabled: boolean;
  host: string | null;
  intervalSec: number;
  lastSyncAt: number | null;
  lastSyncOk: boolean;
  lastError: string | null;
}

const state: SyncState = {
  enabled: false,
  host: null,
  intervalSec: 60,
  lastSyncAt: null,
  lastSyncOk: false,
  lastError: null,
};

function extractHost(syncUrl: string): string | null {
  try {
    const url = new URL(syncUrl);
    return url.hostname || null;
  } catch {
    return null;
  }
}

export function initSyncStatus(): void {
  if (config.syncUrl) {
    state.enabled = true;
    state.host = extractHost(config.syncUrl);
    state.intervalSec = config.syncInterval;
  }
}

export function getSyncStatus(): Readonly<SyncState> {
  return state;
}

export async function syncAndRecord(client: Client): Promise<void> {
  if (!state.enabled) return;

  try {
    await client.sync();
    state.lastSyncAt = Date.now();
    state.lastSyncOk = true;
    state.lastError = null;
  } catch (err) {
    state.lastSyncAt = Date.now();
    state.lastSyncOk = false;
    state.lastError = err instanceof Error ? err.message : String(err);
  }
}
