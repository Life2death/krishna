import type { LearnedAction } from "@/types";
import { remoteGet, remotePost, remoteDelete, type BrainConfig } from "./remote-client";

export function createRemoteLearnedActionsRepo(config: BrainConfig) {
  return {
    async getAllLearnedActions(): Promise<LearnedAction[]> {
      return remoteGet<LearnedAction[]>("/learned-actions", config);
    },

    async getLearnedActionById(id: string): Promise<LearnedAction | null> {
      return remoteGet<LearnedAction | null>(`/learned-actions/${encodeURIComponent(id)}`, config);
    },

    async getLearnedActionByInput(input: string): Promise<LearnedAction | null> {
      return remoteGet<LearnedAction | null>(
        `/learned-actions/by-input/${encodeURIComponent(input)}`,
        config,
      );
    },

    async createLearnedAction(action: LearnedAction): Promise<LearnedAction> {
      return remotePost<LearnedAction>("/learned-actions", action, config);
    },

    async deleteLearnedAction(id: string): Promise<boolean> {
      const result = await remoteDelete<{ ok: boolean }>(`/learned-actions/${encodeURIComponent(id)}`, config);
      return result.ok;
    },

    async deleteAllLearnedActions(): Promise<boolean> {
      const result = await remoteDelete<{ ok: boolean }>("/learned-actions", config);
      return result.ok;
    },
  };
}

export type RemoteLearnedActionsRepo = ReturnType<typeof createRemoteLearnedActionsRepo>;
