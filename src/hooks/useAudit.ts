import { useCallback, useEffect, useState } from "react";
import { getAllAuditEntries, deleteAllAuditEntries } from "@/lib/database";
import type { AuditEntry } from "@/types/audit";

export const useAudit = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getAllAuditEntries();
      setEntries(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch audit log";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearAll = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      await deleteAllAuditEntries();
      await fetchEntries();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to clear audit log";
      setError(message);
      throw err;
    }
  }, [fetchEntries]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  return {
    entries,
    isLoading,
    error,
    clearAll,
    refresh: fetchEntries,
  };
};
