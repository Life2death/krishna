import type { Client } from "@libsql/client";
import type { BrainContext } from "../context.ts";
import { getAllMemories } from "@krishna/core";
import { createStore, type VectorStore } from "./store.ts";

let store: VectorStore | null = null;
let indexed = false;

export function getStore(): VectorStore {
  if (!store) throw new Error("RAG store not initialized");
  return store;
}

export async function initRag(ctx: BrainContext): Promise<void> {
  store = createStore(ctx.db);

  const cnt = await store.count();
  console.log(`[rag] ${cnt} existing embeddings in store`);

  if (cnt === 0) {
    console.log("[rag] Indexing existing memories…");
    const memories = await getAllMemories();
    const plaintext = memories
      .filter((m) => m.confirmed && m.value)
      .map((m) => ({
        id: m.id,
        content: m.key ? `${m.key}: ${ctx.crypto.decrypt(m.value as string) ?? m.value}` : (ctx.crypto.decrypt(m.value as string) ?? m.value),
      }));

    if (plaintext.length > 0) {
      await store.indexMemoriesBatch(plaintext);
      console.log(`[rag] Indexed ${plaintext.length} memories`);
    }
  }

  indexed = true;
}

export async function reindexAll(ctx: BrainContext): Promise<number> {
  const s = getStore();
  const memories = await getAllMemories();
  const plaintext = memories
    .filter((m) => m.confirmed && m.value)
    .map((m) => ({
      id: m.id,
      content: m.key
        ? `${m.key}: ${ctx.crypto.decrypt(m.value as string) ?? m.value}`
        : (ctx.crypto.decrypt(m.value as string) ?? m.value),
    }));

  for (const item of plaintext) {
    await s.removeByMemoryId(item.id);
  }

  if (plaintext.length > 0) {
    await s.indexMemoriesBatch(plaintext);
  }

  return plaintext.length;
}

export function isRagReady(): boolean {
  return indexed;
}
