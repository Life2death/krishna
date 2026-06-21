import type { FastifyInstance } from "fastify";
import { getStore, isRagReady, reindexAll } from "../rag/index.ts";
import type { BrainContext } from "../context.ts";

export function ragRoutes(app: FastifyInstance, ctx: BrainContext): void {
  /**
   * POST /rag/search — semantic search over indexed memories.
   * Body: { query: string, topK?: number, minScore?: number }
   * Returns: { results: Array<{ id, memoryId, content, source, score }> }
   */
  app.post("/rag/search", async (req, reply) => {
    if (!isRagReady()) {
      return reply.code(503).send({ error: "RAG index not ready" });
    }

    const { query, topK = 5, minScore } = req.body as {
      query: string;
      topK?: number;
      minScore?: number;
    };

    if (!query || typeof query !== "string") {
      return reply.code(400).send({ error: "query is required" });
    }

    try {
      const store = getStore();
      const results = await store.search(query, topK, minScore);
      return { results };
    } catch (err) {
      return reply.code(500).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * POST /rag/reindex — rebuild the entire embedding index from current memories.
   */
  app.post("/rag/reindex", async (_req, reply) => {
    try {
      const count = await reindexAll(ctx);
      return { indexed: count };
    } catch (err) {
      return reply.code(500).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * GET /rag/status — check if RAG is ready and how many embeddings are stored.
   */
  app.get("/rag/status", async () => {
    const store = getStore();
    const count = await store.count();
    return {
      ready: isRagReady(),
      embeddings: count,
    };
  });
}
