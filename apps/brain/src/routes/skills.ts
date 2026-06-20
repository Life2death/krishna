import type { FastifyInstance } from "fastify";
import {
  getAllSkills,
  getSkillById,
  getSkillByName,
  createSkill,
  updateSkillUseCount,
  deleteSkill,
  deleteAllSkills,
} from "@krishna/core";
import type { Skill } from "@krishna/core/types";
import type { BrainContext } from "../context.ts";

export function skillsRoutes(app: FastifyInstance, ctx: BrainContext): void {
  app.get("/skills", async () => getAllSkills());

  app.get("/skills/:id", async (req, reply) => {
    const s = await getSkillById(Number((req.params as { id: string }).id));
    if (!s) return reply.code(404).send({ error: "not found" });
    return s;
  });

  app.get("/skills/by-name/:name", async (req, reply) => {
    const s = await getSkillByName((req.params as { name: string }).name);
    if (!s) return reply.code(404).send({ error: "not found" });
    return s;
  });

  app.post("/skills", async (req) => {
    const saved = await createSkill(req.body as Skill);
    ctx.hub.broadcast("skills", "create", saved);
    return saved;
  });

  app.post("/skills/:id/use", async (req) => {
    const id = Number((req.params as { id: string }).id);
    await updateSkillUseCount(id);
    ctx.hub.broadcast("skills", "save", { id });
    return { ok: true };
  });

  app.delete("/skills/:id", async (req) => {
    const id = Number((req.params as { id: string }).id);
    const ok = await deleteSkill(id);
    if (ok) ctx.hub.broadcast("skills", "delete", { id });
    return { ok };
  });

  app.delete("/skills", async () => {
    const ok = await deleteAllSkills();
    if (ok) ctx.hub.broadcast("skills", "deleteAll", {});
    return { ok };
  });
}
