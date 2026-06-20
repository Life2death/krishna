import { useCallback, useEffect, useState } from "react";
import { getRepo } from "@/lib/repo-selector";
import { useBrainWs } from "./useBrainWs";
import type { Reminder } from "@/types/reminder";

export const useReminders = () => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReminders = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getRepo().reminders.getAllReminders();
      setReminders(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch reminders";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleReminder = useCallback(async (id: string, enabled: number): Promise<void> => {
    try {
      setError(null);
      const reminder = reminders.find(r => r.id === id);
      if (!reminder) return;
      await getRepo().reminders.updateReminder({ ...reminder, enabled });
      await fetchReminders();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to toggle reminder";
      setError(message);
      throw err;
    }
  }, [reminders, fetchReminders]);

  const removeReminder = useCallback(async (id: string): Promise<void> => {
    try {
      setError(null);
      await getRepo().reminders.deleteReminder(id);
      await fetchReminders();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete reminder";
      setError(message);
      throw err;
    }
  }, [fetchReminders]);

  const clearAll = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      const repo = getRepo().reminders;
      for (const r of reminders) {
        await repo.deleteReminder(r.id);
      }
      await fetchReminders();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to clear reminders";
      setError(message);
      throw err;
    }
  }, [reminders, fetchReminders]);

  useBrainWs("reminders", fetchReminders);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  return {
    reminders,
    isLoading,
    error,
    toggleReminder,
    removeReminder,
    clearAll,
    refresh: fetchReminders,
  };
};
