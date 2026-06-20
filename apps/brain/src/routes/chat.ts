import type { FastifyInstance } from "fastify";
import { fetchAIResponse } from "@krishna/core";
import type { Message } from "@krishna/core/types";
import { config } from "../config.ts";
import { claudeProvider, claudeSelectedProvider } from "../provider.ts";

interface ChatBody {
  userMessage: string;
  history?: Message[];
  systemPrompt?: string;
  imagesBase64?: string[];
}

/**
 * POST /chat — Server-Sent Events stream of the Claude reply, generated
 * server-side with the brain's Anthropic key (never exposed to clients).
 * Each token arrives as `data: {"delta": "..."}`; the stream ends with
 * `data: [DONE]`.
 */
export function chatRoutes(app: FastifyInstance): void {
  app.post("/chat", async (req, reply) => {
    const { userMessage, history = [], systemPrompt, imagesBase64 = [] } = req.body as ChatBody;

    if (!config.anthropicApiKey) {
      return reply.code(503).send({ error: "ANTHROPIC_API_KEY not configured in the brain" });
    }
    if (!userMessage || typeof userMessage !== "string") {
      return reply.code(400).send({ error: "userMessage is required" });
    }

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      for await (const chunk of fetchAIResponse({
        provider: claudeProvider,
        selectedProvider: claudeSelectedProvider(),
        systemPrompt,
        history,
        userMessage,
        imagesBase64,
      })) {
        res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : String(err) })}\n\n`);
    } finally {
      res.end();
    }
  });
}
