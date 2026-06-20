import type { ChatConversation } from "@/types/completion";
import { remoteGet, remotePost, remoteDelete, type BrainConfig } from "./remote-client";

export function createRemoteChatHistoryRepo(config: BrainConfig) {
  return {
    async getAllConversations(): Promise<ChatConversation[]> {
      return remoteGet<ChatConversation[]>("/conversations", config);
    },

    async getConversationById(id: string): Promise<ChatConversation | null> {
      return remoteGet<ChatConversation | null>(`/conversations/${encodeURIComponent(id)}`, config);
    },

    async getMostRecentConversation(): Promise<ChatConversation | null> {
      return remoteGet<ChatConversation | null>("/conversations/recent", config);
    },

    async saveConversation(conversation: ChatConversation): Promise<ChatConversation> {
      return remotePost<ChatConversation>("/conversations", conversation, config);
    },

    async appendMessages(
      conversationId: string,
      messages: { role: "user" | "assistant"; content: string; timestamp: number }[],
    ): Promise<void> {
      await remotePost<{ ok: boolean }>(
        `/conversations/${encodeURIComponent(conversationId)}/messages`,
        { messages },
        config,
      );
    },

    async deleteConversation(id: string): Promise<boolean> {
      const result = await remoteDelete<{ ok: boolean }>(`/conversations/${encodeURIComponent(id)}`, config);
      return result.ok;
    },

    async deleteAllConversations(): Promise<void> {
      await remoteDelete<{ ok: boolean }>("/conversations", config);
    },
  };
}

export type RemoteChatHistoryRepo = ReturnType<typeof createRemoteChatHistoryRepo>;
