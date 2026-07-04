import { useEffect, useState, useCallback } from "react";
import { getRecentSpeech, deleteAllSpeechLog, type SpeechLogEntry, type SpeechSource } from "@/lib/database";
import { Header, Button } from "@/components";

// T4-F7: shows EVERY spoken utterance (not just command outcomes) so the owner can see
// exactly what Krishna read aloud — confirmation prompts, timeouts, declines, fillers,
// errors — and fine-tune from there. Mirrors LatencyPanel's shape/refresh cadence.

const SOURCE_STYLE: Record<SpeechSource, string> = {
  answer: "bg-green-500/10 text-green-400",
  status: "bg-sky-500/10 text-sky-400",
  ack: "bg-sky-500/10 text-sky-400",
  canned: "bg-teal-500/10 text-teal-400",
  confirm_prompt: "bg-yellow-500/10 text-yellow-400",
  reask: "bg-yellow-500/10 text-yellow-400",
  filler: "bg-muted text-muted-foreground",
  timeout: "bg-orange-500/10 text-orange-400",
  decline: "bg-orange-500/10 text-orange-400",
  error: "bg-red-500/10 text-red-400",
};

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const SpeechLogPanel = () => {
  const [entries, setEntries] = useState<SpeechLogEntry[]>([]);

  const load = useCallback(async () => {
    try {
      setEntries(await getRecentSpeech({ limit: 100 }));
    } catch {
      /* table may not exist yet on a very old DB — ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const handleClear = async () => {
    await deleteAllSpeechLog();
    await load();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Header
          title="Speech Log (T4-F7)"
          description="Every spoken utterance — success or failure — with its source and linked command"
        />
        {entries.length > 0 && (
          <Button size="sm" variant="ghost" onClick={handleClear}>Clear</Button>
        )}
      </div>

      {entries.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Nothing spoken yet. Talk to Krishna and every line it reads aloud shows up here.
        </p>
      )}

      {entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-muted-foreground border-b border-border/30">
                <th className="text-left py-1 pr-2">Time</th>
                <th className="text-left py-1 pr-2">Source</th>
                <th className="text-left py-1 pr-2">Spoken text</th>
                <th className="text-left py-1 pl-2">Command</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border/10 hover:bg-muted/20 align-top">
                  <td className="py-1 pr-2 text-muted-foreground tabular-nums whitespace-nowrap">{formatTime(e.createdAt)}</td>
                  <td className="py-1 pr-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${SOURCE_STYLE[e.source] ?? "bg-muted text-muted-foreground"}`}>
                      {e.source}
                    </span>
                  </td>
                  <td className="py-1 pr-2 max-w-[380px]">{e.text}</td>
                  <td className="py-1 pl-2 text-muted-foreground font-mono text-[10px]">
                    {e.relatedCommandId ? e.relatedCommandId.slice(0, 8) : "—"}
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
