import { useCallback, useEffect, useState } from "react";
import { getRepo } from "@/lib/repo-selector";
import { useBrainWs } from "./useBrainWs";
import type { LearnedAction } from "@/types";

export const useLearnedActions = () => {
  const [actions, setActions] = useState<LearnedAction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getRepo().learnedActions.getAllLearnedActions();
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
      return await getRepo().learnedActions.getLearnedActionByInput(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to look up learned action";
      setError(message);
      return null;
    }
  }, []);

  const addAction = useCallback(async (action: LearnedAction): Promise<void> => {
    try {
      setError(null);
      await getRepo().learnedActions.createLearnedAction(action);
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
      await getRepo().learnedActions.deleteLearnedAction(id);
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
      await getRepo().learnedActions.deleteAllLearnedActions();
      await fetchActions();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to clear learned actions";
      setError(message);
      throw err;
    }
  }, [fetchActions]);

  useBrainWs("learned-actions", fetchActions);

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
