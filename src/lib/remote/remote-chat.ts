import type { Message } from "@/types";
import { type BrainConfig } from "./remote-client";

interface ChatBody {
  userMessage: string;
  history?: Message[];
  systemPrompt?: string;
}

export function createRemoteChatRepo(config: BrainConfig) {
  return {
    /**
     * Calls the brain's /chat SSE endpoint and yields response tokens.
     * The brain holds the Claude key server-side — no client key needed.
     */
    async* fetchAIResponse(params: {
      userMessage: string;
      history?: Message[];
      systemPrompt?: string;
      signal?: AbortSignal;
    }): AsyncIterable<string> {
      const { userMessage, history = [], systemPrompt, signal } = params;

      const baseUrl = config.brainUrl.replace(/\/+$/, "");
      const response = await fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.brainToken}`,
        },
        body: JSON.stringify({ userMessage, history, systemPrompt } satisfies ChatBody),
        signal,
      });

      if (!response.ok) {
        let errorText = "";
        try {
          errorText = await response.text();
        } catch {}
        throw new Error(`Brain /chat failed: ${response.status} ${errorText}`);
      }

      if (!response.body) {
        throw new Error("Brain /chat returned no response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        if (signal?.aborted) {
          reader.cancel();
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.delta) {
                yield parsed.delta;
              }
            } catch {
              // skip partial/unparseable chunks
            }
          }
        }
      }
    },
  };
}

export type RemoteChatRepo = ReturnType<typeof createRemoteChatRepo>;
