import type { FastifyInstance } from "fastify";
import {
  getAllReminders,
  getDueReminders,
  createReminder,
  updateReminder,
  cancelReminder,
  deleteReminder,
} from "@krishna/core";
import type { Reminder } from "@krishna/core/types";
import type { BrainContext } from "../context.ts";

export function remindersRoutes(app: FastifyInstance, ctx: BrainContext): void {
  app.get("/reminders", async () => getAllReminders());
  app.get("/reminders/due", async () => getDueReminders());

  app.post("/reminders", async (req) => {
    const saved = await createReminder(req.body as Reminder);
    ctx.hub.broadcast("reminders", "create", saved);
    return saved;
  });

  app.put("/reminders/:id", async (req) => {
    const reminder = req.body as Reminder;
    await updateReminder(reminder);
    ctx.hub.broadcast("reminders", "save", { id: reminder.id });
    return { ok: true };
  });

  app.post("/reminders/:id/cancel", async (req) => {
    const id = (req.params as { id: string }).id;
    const ok = await cancelReminder(id);
    if (ok) ctx.hub.broadcast("reminders", "save", { id });
    return { ok };
  });

  app.delete("/reminders/:id", async (req) => {
    const id = (req.params as { id: string }).id;
    const ok = await deleteReminder(id);
    if (ok) ctx.hub.broadcast("reminders", "delete", { id });
    return { ok };
  });
}
