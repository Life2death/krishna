import type { FastifyInstance } from "fastify";
import {
  getAllLearnedActions,
  getLearnedActionById,
  getLearnedActionByInput,
  createLearnedAction,
  deleteLearnedAction,
  deleteAllLearnedActions,
} from "@krishna/core";
import type { LearnedAction } from "@krishna/core/types";
import type { BrainContext } from "../context.ts";

export function learnedActionsRoutes(app: FastifyInstance, ctx: BrainContext): void {
  app.get("/learned-actions", async () => getAllLearnedActions());

  app.get("/learned-actions/:id", async (req, reply) => {
    const a = await getLearnedActionById((req.params as { id: string }).id);
    if (!a) return reply.code(404).send({ error: "not found" });
    return a;
  });

  app.get("/learned-actions/by-input/:input", async (req, reply) => {
    const a = await getLearnedActionByInput(
      decodeURIComponent((req.params as { input: string }).input),
    );
    if (!a) return reply.code(404).send({ error: "not found" });
    return a;
  });

  app.post("/learned-actions", async (req) => {
    const saved = await createLearnedAction(req.body as LearnedAction);
    ctx.hub.broadcast("learned-actions", "create", saved);
    return saved;
  });

  app.delete("/learned-actions/:id", async (req) => {
    const id = (req.params as { id: string }).id;
    const ok = await deleteLearnedAction(id);
    if (ok) ctx.hub.broadcast("learned-actions", "delete", { id });
    return { ok };
  });

  app.delete("/learned-actions", async () => {
    const ok = await deleteAllLearnedActions();
    if (ok) ctx.hub.broadcast("learned-actions", "deleteAll", {});
    return { ok };
  });
}
