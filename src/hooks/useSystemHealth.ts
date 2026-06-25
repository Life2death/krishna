import { useEffect, useState, useCallback, useRef } from "react";
import { readBrainConfig, remoteGet, remotePost, type BrainConfig } from "@/lib/remote";

export interface HealthStatus {
  brain: { ok: boolean; version?: string; uptimeSec?: number; clients?: number };
  db: { ok: boolean; path?: string; error?: string };
  sync: {
    ok: boolean;
    enabled: boolean;
    host: string | null;
    intervalSec: number;
    lastSyncAt: number | null;
    lastSyncOk: boolean;
    lastError: string | null;
  };
  gmail: { ok: boolean; configured: boolean; tools: number; tokenPresent: boolean; expiryDate: number | null; expired: boolean; error?: string };
  rag: { ok: boolean; enabled: boolean; ready: boolean; embeddings?: number; error?: string };
  ai: { ok: boolean; provider: string; keyConfigured: boolean; model: string };
  mcp: { ok: boolean; tools: number };
  data: { ok: boolean; memories?: number; conversations?: number; reminders?: number; learnedActions?: number; skills?: number; error?: string };
}

const POLL_INTERVAL = 15_000;

export function useSystemHealth() {
  const config = useRef(readBrainConfig());
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHealth = useCallback(async () => {
    const cfg = config.current;
    if (cfg.brainMode !== "remote") {
      setError(null);
      setStatus(null);
      return;
    }

    setIsLoading(true);
    try {
      const data = await remoteGet<HealthStatus>("/status", cfg);
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch health");
      setStatus(null);
    } finally {
      setLastCheckedAt(Date.now());
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    timerRef.current = setInterval(fetchHealth, POLL_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchHealth]);

  const forceSync = useCallback(async () => {
    const cfg = config.current;
    if (cfg.brainMode !== "remote") return;
    try {
      await remotePost("/status/sync", {}, cfg);
      await fetchHealth();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync request failed");
    }
  }, [fetchHealth]);

  return { status, error, lastCheckedAt, isLoading, refresh: fetchHealth, forceSync };
}
