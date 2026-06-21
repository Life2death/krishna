import type { FastifyInstance } from "fastify";
import { fetchAIResponse } from "@krishna/core";
import type { Message } from "@krishna/core/types";
import { config } from "../config.ts";
import { claudeProvider, claudeSelectedProvider } from "../provider.ts";
import { isRagReady, getStore } from "../rag/index.ts";

interface ChatBody {
  userMessage: string;
  history?: Message[];
  systemPrompt?: string;
  imagesBase64?: string[];
}

async function augmentWithRag(userMessage: string, basePrompt: string | undefined): Promise<string> {
  if (!isRagReady()) return basePrompt ?? "";

  try {
    const store = getStore();
    const results = await store.search(userMessage, 5, 0.3);
    if (results.length === 0) return basePrompt ?? "";

    const contextBlock = results
      .map((r) => `- ${r.content}`)
      .join("\n");

    const ragPrompt = `\n\nRelevant context from memory:\n${contextBlock}\n\nUse this context when relevant to the user's request.`;
    return (basePrompt ?? "") + ragPrompt;
  } catch {
    return basePrompt ?? "";
  }
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

    const augmentedPrompt = await augmentWithRag(userMessage, systemPrompt);

    const abortController = new AbortController();
    req.raw.on("close", () => {
      if (req.raw.destroyed) abortController.abort();
    });

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
        systemPrompt: augmentedPrompt || undefined,
        history,
        userMessage,
        imagesBase64,
        signal: abortController.signal,
      })) {
        res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
    } catch (err) {
      if (abortController.signal.aborted) return;
      res.write(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : String(err) })}\n\n`);
    } finally {
      res.end();
    }
  });
}
