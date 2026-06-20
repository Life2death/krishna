import type { FastifyInstance } from "fastify";
import {
  getAllSystemPrompts,
  getSystemPromptById,
  createSystemPrompt,
  updateSystemPrompt,
  deleteSystemPrompt,
} from "@krishna/core";
import type { SystemPromptInput, UpdateSystemPromptInput } from "@krishna/core/types";
import type { BrainContext } from "../context.ts";

export function systemPromptsRoutes(app: FastifyInstance, ctx: BrainContext): void {
  app.get("/system-prompts", async () => getAllSystemPrompts());

  app.get("/system-prompts/:id", async (req, reply) => {
    const p = await getSystemPromptById(Number((req.params as { id: string }).id));
    if (!p) return reply.code(404).send({ error: "not found" });
    return p;
  });

  app.post("/system-prompts", async (req) => {
    const saved = await createSystemPrompt(req.body as SystemPromptInput);
    ctx.hub.broadcast("system-prompts", "create", saved);
    return saved;
  });

  app.put("/system-prompts/:id", async (req) => {
    const id = Number((req.params as { id: string }).id);
    const saved = await updateSystemPrompt(id, req.body as UpdateSystemPromptInput);
    ctx.hub.broadcast("system-prompts", "save", saved);
    return saved;
  });

  app.delete("/system-prompts/:id", async (req) => {
    const id = Number((req.params as { id: string }).id);
    await deleteSystemPrompt(id);
    ctx.hub.broadcast("system-prompts", "delete", { id });
    return { ok: true };
  });
}
