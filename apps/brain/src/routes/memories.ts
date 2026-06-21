import type { FastifyInstance } from "fastify";
import {
  getAllMemories,
  getMemoryById,
  createMemory,
  deleteMemory,
  deleteAllMemories,
} from "@krishna/core";
import type { Memory } from "@krishna/core/types";
import type { BrainContext } from "../context.ts";
import { isRagReady, getStore } from "../rag/index.ts";

/**
 * Memories — `value` holds the sensitive personal fact, so it is encrypted at
 * the brain boundary before hitting the DB and decrypted on the way out. `key`
 * stays plaintext so dedupe-by-key and lookups keep working.
 */
export function memoriesRoutes(app: FastifyInstance, ctx: BrainContext): void {
  const enc = (m: Memory): Memory => ({ ...m, value: ctx.crypto.encrypt(m.value) as string });
  const dec = (m: Memory): Memory => ({ ...m, value: ctx.crypto.decrypt(m.value) as string });

  app.get("/memories", async () => (await getAllMemories()).map(dec));

  app.get("/memories/:id", async (req, reply) => {
    const m = await getMemoryById((req.params as { id: string }).id);
    if (!m) return reply.code(404).send({ error: "not found" });
    return dec(m);
  });

  app.post("/memories", async (req) => {
    const saved = await createMemory(enc(req.body as Memory));
    const plain = dec(saved);
    ctx.hub.broadcast("memories", "create", plain);

    // Index in RAG (non-blocking)
    if (isRagReady() && plain.value) {
      const content = plain.key
        ? `${plain.key}: ${plain.value}`
        : plain.value;
      getStore().indexMemory(plain.id, content).catch(() => {});
    }

    return plain;
  });

  app.delete("/memories/:id", async (req) => {
    const id = (req.params as { id: string }).id;
    const ok = await deleteMemory(id);
    if (ok) {
      ctx.hub.broadcast("memories", "delete", { id });
      // Remove from RAG index (non-blocking)
      if (isRagReady()) {
        getStore().removeByMemoryId(id).catch(() => {});
      }
    }
    return { ok };
  });

  app.delete("/memories", async () => {
    const ok = await deleteAllMemories();
    if (ok) ctx.hub.broadcast("memories", "deleteAll", {});
    return { ok };
  });
}
