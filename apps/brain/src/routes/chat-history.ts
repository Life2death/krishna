import type { FastifyInstance } from "fastify";
import {
  getAllConversations,
  getConversationById,
  getMostRecentConversation,
  saveConversation,
  appendMessages,
  deleteConversation,
  deleteAllConversations,
} from "@krishna/core";
import type { ChatConversation } from "@krishna/core/types";
import type { BrainContext } from "../context.ts";

/**
 * Chat history — message `content` is sensitive (it's the conversation), so it
 * is encrypted at the boundary. Roles/timestamps/ids stay plaintext.
 */
export function chatHistoryRoutes(app: FastifyInstance, ctx: BrainContext): void {
  const encConv = (c: ChatConversation): ChatConversation => ({
    ...c,
    messages: c.messages.map((m) => ({ ...m, content: ctx.crypto.encrypt(m.content) as string })),
  });
  const decConv = (c: ChatConversation): ChatConversation => ({
    ...c,
    messages: c.messages.map((m) => ({ ...m, content: ctx.crypto.decrypt(m.content) as string })),
  });

  app.get("/conversations", async () => (await getAllConversations()).map(decConv));

  app.get("/conversations/recent", async () => {
    const c = await getMostRecentConversation();
    return c ? decConv(c) : null;
  });

  app.get("/conversations/:id", async (req, reply) => {
    const c = await getConversationById((req.params as { id: string }).id);
    if (!c) return reply.code(404).send({ error: "not found" });
    return decConv(c);
  });

  app.post("/conversations", async (req) => {
    const conv = req.body as ChatConversation;
    const saved = await saveConversation(encConv(conv));
    ctx.hub.broadcast("conversations", "save", { id: conv.id });
    return decConv(saved);
  });

  app.post("/conversations/:id/messages", async (req) => {
    const id = (req.params as { id: string }).id;
    const { messages } = req.body as {
      messages: { role: "user" | "assistant"; content: string; timestamp: number }[];
    };
    const encrypted = messages.map((m) => ({ ...m, content: ctx.crypto.encrypt(m.content) as string }));
    await appendMessages(id, encrypted);
    ctx.hub.broadcast("conversations", "append", { id });
    return { ok: true };
  });

  app.delete("/conversations/:id", async (req) => {
    const id = (req.params as { id: string }).id;
    const ok = await deleteConversation(id);
    if (ok) ctx.hub.broadcast("conversations", "delete", { id });
    return { ok };
  });

  app.delete("/conversations", async () => {
    await deleteAllConversations();
    ctx.hub.broadcast("conversations", "deleteAll", {});
    return { ok: true };
  });
}
