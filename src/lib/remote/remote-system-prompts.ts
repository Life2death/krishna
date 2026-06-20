import type { SystemPrompt, SystemPromptInput, UpdateSystemPromptInput } from "@/types";
import { remoteGet, remotePost, remotePut, remoteDelete, type BrainConfig } from "./remote-client";

export function createRemoteSystemPromptsRepo(config: BrainConfig) {
  return {
    async getAllSystemPrompts(): Promise<SystemPrompt[]> {
      return remoteGet<SystemPrompt[]>("/system-prompts", config);
    },

    async getSystemPromptById(id: number): Promise<SystemPrompt | null> {
      return remoteGet<SystemPrompt | null>(`/system-prompts/${id}`, config);
    },

    async createSystemPrompt(input: SystemPromptInput): Promise<SystemPrompt> {
      return remotePost<SystemPrompt>("/system-prompts", input, config);
    },

    async updateSystemPrompt(id: number, input: UpdateSystemPromptInput): Promise<SystemPrompt> {
      return remotePut<SystemPrompt>(`/system-prompts/${id}`, input, config);
    },

    async deleteSystemPrompt(id: number): Promise<void> {
      await remoteDelete<{ ok: boolean }>(`/system-prompts/${id}`, config);
    },
  };
}

export type RemoteSystemPromptsRepo = ReturnType<typeof createRemoteSystemPromptsRepo>;
