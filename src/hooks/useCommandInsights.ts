import { useState, useEffect, useCallback, useRef } from "react";
import { getCommandStats, getRecentActivity, deleteAllCommandLog } from "@/lib/database";
import type { FailureReason, CommandLogEntry } from "@/lib/database";
import { listen } from "@tauri-apps/api/event";

export interface CommandStats {
  total: number;
  answered: number;
  failed: number;
  declined: number;
  pending: number;
  byReason: { reason: FailureReason; count: number }[];
}

const emptyStats: CommandStats = {
  total: 0,
  answered: 0,
  failed: 0,
  declined: 0,
  pending: 0,
  byReason: [],
};

export function useCommandInsights() {
  const [stats, setStats] = useState<CommandStats>(emptyStats);
  const [recent, setRecent] = useState<CommandLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [s, r] = await Promise.all([
        getCommandStats(),
        getRecentActivity({ limit: 20 }),
      ]);
      setStats(s);
      setRecent(r);
    } catch {
      setStats(emptyStats);
      setRecent([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Live refresh via Tauri event — bar emits "command-log-updated" after every insert/update
  useEffect(() => {
    const setup = async () => {
      const unlisten = await listen("command-log-updated", () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(refresh, 150);
      });
      return unlisten;
    };
    const cleanup = setup();
    return () => {
      cleanup.then((fn) => fn());
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clearAll = useCallback(async () => {
    await deleteAllCommandLog();
    await refresh();
  }, [refresh]);

  return { stats, recent, isLoading, refresh, clearAll };
}
