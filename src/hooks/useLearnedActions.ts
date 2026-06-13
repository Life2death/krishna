import { useCallback, useEffect, useState } from "react";
import {
  getAllLearnedActions,
  getLearnedActionByInput,
  createLearnedAction,
  deleteLearnedAction,
  deleteAllLearnedActions,
} from "@/lib/database";
import type { LearnedAction } from "@/types";

export const useLearnedActions = () => {
  const [actions, setActions] = useState<LearnedAction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getAllLearnedActions();
      setActions(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch learned actions";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const findByInput = useCallback(async (input: string): Promise<LearnedAction | null> => {
    try {
      return await getLearnedActionByInput(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to look up learned action";
      setError(message);
      return null;
    }
  }, []);

  const addAction = useCallback(async (action: LearnedAction): Promise<void> => {
    try {
      setError(null);
      await createLearnedAction(action);
      await fetchActions();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create learned action";
      setError(message);
      throw err;
    }
  }, [fetchActions]);

  const removeAction = useCallback(async (id: string): Promise<void> => {
    try {
      setError(null);
      await deleteLearnedAction(id);
      await fetchActions();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete learned action";
      setError(message);
      throw err;
    }
  }, [fetchActions]);

  const clearAll = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      await deleteAllLearnedActions();
      await fetchActions();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to clear learned actions";
      setError(message);
      throw err;
    }
  }, [fetchActions]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  return {
    actions,
    isLoading,
    error,
    findByInput,
    addAction,
    removeAction,
    clearAll,
    refresh: fetchActions,
  };
};
