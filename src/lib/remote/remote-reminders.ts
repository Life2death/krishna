import type { Reminder } from "@/types/reminder";
import { remoteGet, remotePost, remotePut, remoteDelete, type BrainConfig } from "./remote-client";

export function createRemoteRemindersRepo(config: BrainConfig) {
  return {
    async getAllReminders(): Promise<Reminder[]> {
      return remoteGet<Reminder[]>("/reminders", config);
    },

    async getDueReminders(): Promise<Reminder[]> {
      return remoteGet<Reminder[]>("/reminders/due", config);
    },

    async createReminder(reminder: Reminder): Promise<Reminder> {
      return remotePost<Reminder>("/reminders", reminder, config);
    },

    async updateReminder(reminder: Reminder): Promise<void> {
      await remotePut<{ ok: boolean }>(`/reminders/${encodeURIComponent(reminder.id)}`, reminder, config);
    },

    async cancelReminder(id: string): Promise<boolean> {
      const result = await remotePost<{ ok: boolean }>(
        `/reminders/${encodeURIComponent(id)}/cancel`,
        {},
        config,
      );
      return result.ok;
    },

    async deleteReminder(id: string): Promise<boolean> {
      const result = await remoteDelete<{ ok: boolean }>(`/reminders/${encodeURIComponent(id)}`, config);
      return result.ok;
    },
  };
}

export type RemoteRemindersRepo = ReturnType<typeof createRemoteRemindersRepo>;
