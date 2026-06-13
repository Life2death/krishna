export interface Reminder {
  id: string;
  text: string;
  dueAt: number;
  recurrence: string | null;
  skillId: number | null;
  enabled: number;
  createdAt: number;
}
