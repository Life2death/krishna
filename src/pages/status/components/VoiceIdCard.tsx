import { Badge, Button, Switch } from "@/components";
import { Mic, ShieldCheck, Fingerprint, Lock, Loader2 } from "lucide-react";
import { useVoiceStatus, useVoiceEnroll } from "@/hooks";

export const VoiceIdCard = () => {
  const { status, loading, percent, state, canEnable, enabled, setEnabled, refresh } = useVoiceStatus();
  const {
    recording,
    enrolling,
    error: enrollError,
    start: startRecording,
    stop: stopRecording,
  } = useVoiceEnroll(refresh);

  if (loading || !status) {
    return (
      <div className="rounded-md border p-3">
        <div className="mb-1 flex items-center gap-1.5">
          <Fingerprint className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold">Voice ID</span>
        </div>
        <p className="text-xs text-muted-foreground">Loading voice status…</p>
      </div>
    );
  }

  const meterColor = percent >= 100 ? "bg-green-500" : "bg-amber-500";
  const borderColor = percent >= 100
    ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
    : status.sampleCount === 0
      ? "border-muted bg-background"
      : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950";

  return (
    <div className={`rounded-md border p-3 ${borderColor}`}>
      <div className="mb-2 flex items-center gap-1.5">
        <Fingerprint className="h-4 w-4" />
        <span className="text-xs font-semibold">Voice ID</span>
        {state === "active" && (
          <Badge variant="default" className="ml-auto text-xs bg-green-600 text-white">Active</Badge>
        )}
        {state === "ready" && (
          <Badge variant="outline" className="ml-auto text-xs text-green-600">Ready</Badge>
        )}
      </div>

      {/* Confidence meter */}
      <div className="mb-2 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Training</span>
          <span className="font-medium tabular-nums">{percent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${meterColor}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {status.sampleCount} of 24 samples
          {status.adaptiveThreshold != null && ` · threshold: ${status.adaptiveThreshold.toFixed(3)}`}
          {status.thresholdConfidence != null && ` · confidence: ${(status.thresholdConfidence * 100).toFixed(0)}%`}
        </p>
      </div>

      {/* Empty state */}
      {state === "empty" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            No voice samples yet. Record a few short phrases to start.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={recording ? stopRecording : startRecording}
            disabled={enrolling}
            className="h-7 text-xs"
          >
            {recording ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Recording…</>
            ) : (
              <><Mic className="h-3 w-3 mr-1" /> Record First Sample</>
            )}
          </Button>
        </div>
      )}

      {/* Training state */}
      {state === "training" && (
        <div className="space-y-2">
          <Button
            size="sm"
            variant="outline"
            onClick={recording ? stopRecording : startRecording}
            disabled={enrolling}
            className="h-7 text-xs"
          >
            {recording ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Recording…</>
            ) : (
              <><Mic className="h-3 w-3 mr-1" /> Add Voice Sample</>
            )}
          </Button>

          <div className="flex items-center justify-between rounded-md border border-dashed px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Enable Voice ID</span>
            </div>
            <Switch checked={false} disabled />
          </div>
          <p className="text-xs text-muted-foreground">
            Unlocks when training reaches 100%.
          </p>
        </div>
      )}

      {/* Ready state — confidence full, not yet enabled */}
      {state === "ready" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-md border px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
              <span className="text-xs font-medium">Enable Voice ID</span>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
      )}

      {/* Active state */}
      {state === "active" && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-green-600">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Verification running — {status.sampleCount} samples in gallery</span>
          </div>
          <div className="flex items-center justify-between rounded-md border px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
              <span className="text-xs font-medium">Voice ID Enabled</span>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
      )}

      {enrollError && (
        <p className="mt-1 text-xs text-red-500">{enrollError}</p>
      )}
    </div>
  );
};
