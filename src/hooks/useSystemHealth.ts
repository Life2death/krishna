import { useEffect, useState, useCallback, useRef } from "react";
import { getRepo } from "@/lib/repo-selector";

export interface LocalHealthStatus {
  brain: { ok: boolean };
  sync: { ok: boolean; enabled: boolean };
  gmail: { ok: boolean; configured: boolean };
  rag: { ok: boolean; enabled: boolean };
  ai: { ok: boolean; keyConfigured: boolean; model: string };
  mcp: { ok: boolean; tools: number };
  data: { ok: boolean; memories?: number; conversations?: number; reminders?: number };
}

export function useSystemHealth() {
  const [status, setStatus] = useState<LocalHealthStatus | null>(null);
  const [error] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHealth = useCallback(async () => {
    setIsLoading(true);
    try {
      const [memories, conversations] = await Promise.all([
        getRepo().memories.getAllMemories().catch(() => []),
        getRepo().chatHistory.getAllConversations().catch(() => []),
      ]);
      setStatus({
        brain: { ok: true },
        sync: { ok: true, enabled: false },
        gmail: { ok: true, configured: false },
        rag: { ok: true, enabled: false },
        ai: { ok: true, keyConfigured: true, model: "local" },
        mcp: { ok: true, tools: 0 },
        data: { ok: true, memories: memories.length, conversations: conversations.length },
      });
    } catch (err) {
      setStatus({
        brain: { ok: false },
        sync: { ok: false, enabled: false },
        gmail: { ok: false, configured: false },
        rag: { ok: false, enabled: false },
        ai: { ok: false, keyConfigured: false, model: "" },
        mcp: { ok: false, tools: 0 },
        data: { ok: false },
      });
    } finally {
      setLastCheckedAt(Date.now());
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    timerRef.current = setInterval(fetchHealth, 30_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchHealth]);

  const forceSync = useCallback(async () => {
    // Phase 0: no cloud sync.
  }, []);

  return { status, error, lastCheckedAt, isLoading, refresh: fetchHealth, forceSync };
}
