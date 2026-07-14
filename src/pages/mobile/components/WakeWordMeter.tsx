import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isMobileDevice } from "@/lib/platform";

interface DetectorState {
  detectorState: string;
  lastScore: number | null;
  modelAvailable: boolean;
  lastError?: string;
}

function getMeterColor(pct: number): string {
  if (pct < 30) return "bg-green-500";
  if (pct < 60) return "bg-yellow-500";
  return "bg-red-500";
}

const POLL_MS = 400;

export default function WakeWordMeter() {
  const [state, setState] = useState<DetectorState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isMobileDevice()) return;
    let mounted = true;

    const poll = async () => {
      try {
        const raw: string = await invoke("android_get_wake_word_detector_state");
        const data: DetectorState = JSON.parse(raw);
        if (!mounted) return;
        setState(data);
        setError(null);
      } catch (e) {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    };

    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  if (!isMobileDevice()) return null;

  const score = state?.lastScore ?? null;
  const hasScore = score !== null && state?.modelAvailable !== false;

  return (
    <div className="w-full max-w-xs mx-auto">
      {state?.modelAvailable === false ? (
        <p className="text-xs text-muted-foreground text-center">
          Wake model unavailable
        </p>
      ) : (
        <>
          <div className="h-2 w-full rounded-full bg-muted/30 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                hasScore ? getMeterColor((score as number) * 100) : "bg-muted/10"
              }`}
              style={{ width: hasScore ? `${(score as number) * 100}%` : "4%" }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground font-mono">
              {hasScore
                ? `${(score as number).toFixed(3)}`
                : state?.modelAvailable === true
                ? "\u2014"
                : ""}
            </span>
            <span className="text-[10px] text-muted-foreground capitalize">
              {state?.detectorState ?? "\u2014"}
            </span>
          </div>
        </>
      )}
      {error && (
        <p className="text-[10px] text-red-400 text-center mt-0.5">{error}</p>
      )}
    </div>
  );
}
