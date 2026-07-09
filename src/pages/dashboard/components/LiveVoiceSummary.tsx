import { useEffect, useState } from "react";
import { Card } from "@/components";
import { getRecentActivity } from "@/lib/database";
import { TurnTiming } from "@/lib/turn-timing";
import { estimateCostFromTokens, formatCost } from "@/lib/realtime/realtime-cost";
import { MicIcon } from "lucide-react";
import moment from "moment";

interface LiveStats {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  lastAt: number | null;
}

const EMPTY: LiveStats = {
  turns: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  lastAt: null,
};

/**
 * Aggregate view of Live Voice usage. Reads the same command_log rows the Turn
 * Latency table uses (source === "live") so the Dashboard reflects everything
 * that went in and out of Krishna over Live Voice.
 */
export const LiveVoiceSummary = () => {
  const [stats, setStats] = useState<LiveStats>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await getRecentActivity({ limit: 500 });
        const live = rows.filter((r) => r.source === "live");
        const next: LiveStats = { ...EMPTY };
        for (const row of live) {
          next.turns += 1;
          next.lastAt = Math.max(next.lastAt ?? 0, row.createdAt);
          const data = row.timing ? TurnTiming.fromJSON(row.timing) : null;
          const usage = data?.usage;
          if (usage) {
            next.inputTokens += usage.prompt_tokens ?? 0;
            next.outputTokens += usage.completion_tokens ?? 0;
            next.costUsd += estimateCostFromTokens(
              usage.prompt_tokens ?? 0,
              usage.completion_tokens ?? 0,
            );
          }
        }
        if (!cancelled) setStats(next);
      } catch {
        if (!cancelled) setStats(EMPTY);
      }
    };
    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (stats.turns === 0) return null;

  return (
    <Card className="p-4 gap-3 !bg-black/5 dark:!bg-white/5 shadow-none">
      <div className="flex items-center gap-2">
        <MicIcon className="h-4 w-4 text-green-500" />
        <span className="text-sm font-medium">Live Voice</span>
        {stats.lastAt && (
          <span className="ml-auto text-xs text-muted-foreground">
            last used {moment(stats.lastAt).fromNow()}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Turns" value={stats.turns.toLocaleString()} />
        <Stat label="Input tokens" value={stats.inputTokens.toLocaleString()} />
        <Stat label="Output tokens" value={stats.outputTokens.toLocaleString()} />
        <Stat label="Est. cost" value={formatCost(stats.costUsd)} />
      </div>
    </Card>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col">
    <span className="text-lg font-semibold tabular-nums">{value}</span>
    <span className="text-xs text-muted-foreground">{label}</span>
  </div>
);
