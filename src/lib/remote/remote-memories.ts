import type { Memory } from "@/types";
import { remoteGet, remotePost, remoteDelete, type BrainConfig } from "./remote-client";

export function createRemoteMemoriesRepo(config: BrainConfig) {
  return {
    async getAllMemories(): Promise<Memory[]> {
      return remoteGet<Memory[]>("/memories", config);
    },

    async getMemoryById(id: string): Promise<Memory | null> {
      return remoteGet<Memory | null>(`/memories/${encodeURIComponent(id)}`, config);
    },

    async createMemory(memory: Memory): Promise<Memory> {
      return remotePost<Memory>("/memories", memory, config);
    },

    async deleteMemory(id: string): Promise<boolean> {
      const result = await remoteDelete<{ ok: boolean }>(`/memories/${encodeURIComponent(id)}`, config);
      return result.ok;
    },

    async deleteAllMemories(): Promise<boolean> {
      const result = await remoteDelete<{ ok: boolean }>("/memories", config);
      return result.ok;
    },
  };
}

export type RemoteMemoriesRepo = ReturnType<typeof createRemoteMemoriesRepo>;
