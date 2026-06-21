import { useState, useEffect, useCallback } from "react";
import { getCommandStats, getRecentCommands, deleteAllCommandLog } from "@/lib/database";
import type { FailureReason } from "@/lib/database";

export interface CommandStats {
  total: number;
  answered: number;
  failed: number;
  declined: number;
  byReason: { reason: FailureReason; count: number }[];
}

const emptyStats: CommandStats = {
  total: 0,
  answered: 0,
  failed: 0,
  declined: 0,
  byReason: [],
};

export function useCommandInsights() {
  const [stats, setStats] = useState<CommandStats>(emptyStats);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [s, _recent] = await Promise.all([
        getCommandStats(),
        getRecentCommands({ outcome: "failed", limit: 50 }),
      ]);
      setStats(s);
    } catch {
      setStats(emptyStats);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clearAll = useCallback(async () => {
    await deleteAllCommandLog();
    await refresh();
  }, [refresh]);

  return { stats, isLoading, refresh, clearAll };
}
