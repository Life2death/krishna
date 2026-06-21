/**
 * SQLite-backed vector storage.
 * Embeddings are stored as JSON arrays in a `memory_embeddings` table.
 * Search does in-memory cosine similarity (fast enough for personal-scale data).
 */

import type { Client } from "@libsql/client";
import { embedText, embedBatch, cosineSimilarity } from "./embedding.ts";

export interface StoredEmbedding {
  id: string;
  memoryId: string | null;
  content: string;
  embedding: number[];
  source: "memory" | "conversation";
  createdAt: number;
}

export interface SearchResult {
  id: string;
  memoryId: string | null;
  content: string;
  source: string;
  score: number;
}

export function createStore(db: Client) {
  async function insert(
    id: string,
    memoryId: string | null,
    content: string,
    embedding: number[],
    source: "memory" | "conversation"
  ): Promise<void> {
    await db.execute({
      sql: "INSERT OR REPLACE INTO memory_embeddings (id, memory_id, content, embedding, source, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [id, memoryId, content, JSON.stringify(embedding), source, Date.now()],
    });
  }

  async function remove(id: string): Promise<void> {
    await db.execute({
      sql: "DELETE FROM memory_embeddings WHERE id = ?",
      args: [id],
    });
  }

  async function removeByMemoryId(memoryId: string): Promise<void> {
    await db.execute({
      sql: "DELETE FROM memory_embeddings WHERE memory_id = ?",
      args: [memoryId],
    });
  }

  async function search(
    query: string,
    topK = 5,
    minScore = 0.3
  ): Promise<SearchResult[]> {
    const queryVec = await embedText(query);

    const rows = await db.execute({
      sql: "SELECT id, memory_id, content, embedding, source FROM memory_embeddings ORDER BY created_at DESC LIMIT 1000",
      args: [],
    });

    const scored: SearchResult[] = [];
    for (const row of rows.rows) {
      const vec = JSON.parse(row.embedding as string) as number[];
      const score = cosineSimilarity(queryVec, vec);
      if (score >= minScore) {
        scored.push({
          id: row.id as string,
          memoryId: row.memory_id as string | null,
          content: row.content as string,
          source: row.source as string,
          score,
        });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async function indexMemory(
    memoryId: string,
    content: string
  ): Promise<void> {
    const id = `emb_mem_${memoryId}`;
    const embedding = await embedText(content);
    await insert(id, memoryId, content, embedding, "memory");
  }

  async function indexMemoriesBatch(
    items: { id: string; content: string }[]
  ): Promise<void> {
    const texts = items.map((i) => i.content);
    const embeddings = await embedBatch(texts);
    for (let i = 0; i < items.length; i++) {
      const id = `emb_mem_${items[i].id}`;
      await insert(id, items[i].id, items[i].content, embeddings[i], "memory");
    }
  }

  async function count(): Promise<number> {
    const result = await db.execute({
      sql: "SELECT COUNT(*) AS cnt FROM memory_embeddings",
      args: [],
    });
    return Number(result.rows[0].cnt);
  }

  return { insert, remove, removeByMemoryId, search, indexMemory, indexMemoriesBatch, count };
}

export type VectorStore = ReturnType<typeof createStore>;
