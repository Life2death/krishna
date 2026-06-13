import { useCallback, useEffect, useState } from "react";
import { getAllMemories, createMemory, deleteMemory, deleteAllMemories } from "@/lib/database";
import type { Memory } from "@/types";

export const useMemories = () => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMemories = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getAllMemories();
      setMemories(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch memories";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addMemory = useCallback(async (memory: Memory): Promise<void> => {
    try {
      setError(null);
      await createMemory(memory);
      await fetchMemories();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create memory";
      setError(message);
      throw err;
    }
  }, [fetchMemories]);

  const removeMemory = useCallback(async (id: string): Promise<void> => {
    try {
      setError(null);
      await deleteMemory(id);
      await fetchMemories();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete memory";
      setError(message);
      throw err;
    }
  }, [fetchMemories]);

  const clearAll = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      await deleteAllMemories();
      await fetchMemories();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to clear memories";
      setError(message);
      throw err;
    }
  }, [fetchMemories]);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  return {
    memories,
    isLoading,
    error,
    addMemory,
    removeMemory,
    clearAll,
    refresh: fetchMemories,
  };
};