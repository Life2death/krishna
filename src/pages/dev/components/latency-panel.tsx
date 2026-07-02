import { useEffect, useState } from "react";
import { getRecentCommands } from "@/lib/database";
import { TurnTiming, type TurnTimingData } from "@/lib/turn-timing";
import { Header } from "@/components";

interface TimedEntry {
  transcript: string;
  timing: TurnTimingData;
  outcome: string;
  createdAt: number;
}

function formatMs(ms: number | undefined): string {
  if (ms === undefined) return "—";
  return `${ms}ms`;
}

function formatDelta(ms: number | undefined): string {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(n: number | undefined): string {
  if (n === undefined) return "—";
  if (n === 0) return "0";
  return n.toLocaleString();
}

export const LatencyPanel = () => {
  const [entries, setEntries] = useState<TimedEntry[]>([]);

  useEffect(() => {
    const load = async () => {
      const rows = await getRecentCommands({ limit: 50 });
      const timed: TimedEntry[] = [];
      for (const row of rows) {
        if (!row.timing) continue;
        const data = TurnTiming.fromJSON(row.timing);
        if (data?.marks && Object.keys(data.marks).length > 0) {
          timed.push({
            transcript: row.transcript,
            timing: data,
            outcome: row.outcome,
            createdAt: row.createdAt,
          });
        }
      }
      setEntries(timed);
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-3">
      <Header
        title="Turn Latency (Phase 0)"
        description="Per-turn timing breakdown from end-of-speech to TTS completion"
      />

      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No timing data yet. Speak to Krishna to generate measurements.
        </p>
      )}

      {entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-muted-foreground border-b border-border/30">
                <th className="text-left py-1 pr-2">#</th>
                <th className="text-left py-1 pr-2">Transcript</th>
                <th className="text-right py-1 pr-2">E→Send</th>
                <th className="text-right py-1 pr-2">Send→1st</th>
                <th className="text-right py-1 pr-2">1st→Audio</th>
                <th className="text-right py-1 pr-2">Tokens</th>
                <th className="text-right py-1 pr-2">Cache</th>
                <th className="text-right py-1 pr-2">TTS</th>
                <th className="text-right py-1 pr-2">Total</th>
                <th className="text-left py-1 pl-2">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} className="border-b border-border/10 hover:bg-muted/20">
                  <td className="py-1 pr-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-1 pr-2 max-w-[120px] truncate" title={e.transcript}>
                    {e.transcript}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {formatDelta(e.timing.deltas.stt_to_send)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {formatDelta(e.timing.deltas.send_to_first_token)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {formatDelta(e.timing.deltas.first_token_to_first_audio)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {formatDelta(e.timing.deltas.first_token_to_last_token)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {formatTokens(e.timing.usage?.cache_read_input_tokens)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {formatDelta(e.timing.deltas.first_audio_to_last_audio)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums font-medium">
                    {formatDelta(e.timing.deltas.total)}
                  </td>
                  <td className="py-1 pl-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      e.outcome === "answered" ? "bg-green-500/10 text-green-400" :
                      e.outcome === "failed" ? "bg-red-500/10 text-red-400" :
                      "bg-yellow-500/10 text-yellow-400"
                    }`}>
                      {e.outcome}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
