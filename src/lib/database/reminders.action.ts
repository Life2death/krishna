import { getDatabase } from "./config";
import type { Reminder } from "@/types/reminder";

interface DbReminder {
  id: string;
  text: string;
  due_at: number;
  recurrence: string | null;
  skill_id: number | null;
  enabled: number;
  created_at: number;
}

function toReminder(row: DbReminder): Reminder {
  return {
    id: row.id,
    text: row.text,
    dueAt: row.due_at,
    recurrence: row.recurrence,
    skillId: row.skill_id,
    enabled: row.enabled,
    createdAt: row.created_at,
  };
}

export async function getAllReminders(): Promise<Reminder[]> {
  const db = await getDatabase();
  const rows = await db.select<DbReminder[]>(
    "SELECT * FROM reminders ORDER BY created_at DESC"
  );
  return rows.map(toReminder);
}

export async function getDueReminders(): Promise<Reminder[]> {
  const db = await getDatabase();
  const now = Date.now();
  const rows = await db.select<DbReminder[]>(
    "SELECT * FROM reminders WHERE enabled = 1 AND due_at <= ?",
    [now]
  );
  return rows.map(toReminder);
}

export async function createReminder(reminder: Reminder): Promise<Reminder> {
  const db = await getDatabase();
  await db.execute(
    "INSERT INTO reminders (id, text, due_at, recurrence, skill_id, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [reminder.id, reminder.text, reminder.dueAt, reminder.recurrence, reminder.skillId, reminder.enabled, reminder.createdAt]
  );
  return reminder;
}

export async function updateReminder(reminder: Reminder): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    "UPDATE reminders SET text = ?, due_at = ?, recurrence = ?, skill_id = ?, enabled = ? WHERE id = ?",
    [reminder.text, reminder.dueAt, reminder.recurrence, reminder.skillId, reminder.enabled, reminder.id]
  );
}

export async function cancelReminder(id: string): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.execute(
    "UPDATE reminders SET enabled = 0 WHERE id = ?",
    [id]
  );
  return result.rowsAffected > 0;
}

export async function deleteReminder(id: string): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.execute("DELETE FROM reminders WHERE id = ?", [id]);
  return result.rowsAffected > 0;
}
