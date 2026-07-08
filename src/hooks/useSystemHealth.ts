import { useEffect, useState, useCallback, useRef } from "react";
import { getRepo } from "@/lib/repo-selector";

export interface LocalHealthStatus {
  sync: { ok: boolean; enabled: boolean };
  gmail: { ok: boolean; configured: boolean };
  ai: { ok: boolean; keyConfigured: boolean; model: string };
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
        sync: { ok: true, enabled: false },
        gmail: { ok: true, configured: false },
        ai: { ok: true, keyConfigured: true, model: "local" },
        data: { ok: true, memories: memories.length, conversations: conversations.length },
      });
    } catch (err) {
      setStatus({
        sync: { ok: false, enabled: false },
        gmail: { ok: false, configured: false },
        ai: { ok: false, keyConfigured: false, model: "" },
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
