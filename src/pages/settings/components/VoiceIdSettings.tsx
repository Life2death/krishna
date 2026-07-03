import { useState, useEffect } from "react";
import { Switch, Label, Header, Button, Slider } from "@/components";
import { readBrainConfig, saveBrainConfig } from "@/lib/brain-config";
import {
  resetEnrollment,
  isVoiceIdEnabled,
} from "@/lib/voice-client";
import { useVoiceStatus, useVoiceEnroll } from "@/hooks";
import { subscribeToModelLoad, getModelLoadStatus } from "@/lib/voice-id/embedding";
import type { ModelLoadStatus } from "@/lib/voice-id/embedding";
import { Mic, Trash2, ShieldCheck, ShieldAlert, Loader2, Download } from "lucide-react";

export const VoiceIdSettings = () => {
  const [enabled, setEnabled] = useState(isVoiceIdEnabled());
  const [threshold, setThreshold] = useState(readBrainConfig().voiceThreshold ?? 0.85);
  const [resetting, setResetting] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelLoadStatus>(getModelLoadStatus());

  const { status, loading: statusLoading, refresh: fetchStatus } = useVoiceStatus();
  const {
    recording,
    enrolling,
    error: enrollError,
    result: enrollResult,
    start: startRecording,
    stop: stopRecording,
  } = useVoiceEnroll(fetchStatus);

  useEffect(() => {
    return subscribeToModelLoad((s) => setModelStatus(s));
  }, []);

  const handleToggle = (checked: boolean) => {
    const cfg = readBrainConfig();
    cfg.voiceIdEnabled = checked;
    saveBrainConfig(cfg);
    setEnabled(checked);
  };

  const handleThresholdChange = (value: number[]) => {
    const v = value[0];
    setThreshold(v);
    const cfg = readBrainConfig();
    cfg.voiceThreshold = v;
    saveBrainConfig(cfg);
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetEnrollment();
      await fetchStatus();
    } catch {
      /* ignore */
    } finally {
      setResetting(false);
    }
  };

  const isEnrolled = status?.enrolled ?? false;
  const error = enrollError;

  return (
    <div id="voice-id" className="space-y-3">
      <Header
        title="Voice ID"
        description="Speaker verification: only allow your voice to execute commands. Voice ID runs entirely on your device."
        isMainTitle
      />

      <div className="space-y-3 rounded-lg border p-3">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Enable Voice ID</Label>
            <p className="text-xs text-muted-foreground mt-1">
              When enabled, unverified speakers are asked to confirm before executing any action.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={handleToggle} />
        </div>

        {enabled && (
          <>
            {/* Status badge */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                {statusLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : isEnrolled ? (
                  <ShieldCheck className="h-4 w-4 text-green-500" />
                ) : (
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                )}
                <span className={isEnrolled ? "text-green-600" : "text-amber-600"}>
                  {statusLoading ? "Checking..." : isEnrolled ? `Enrolled (${status!.sampleCount}/30 samples)` : "Not enrolled"}
                </span>
              </div>
              {status && (status.mature ? (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> Mature gallery — enforcement active
                </p>
              ) : status.sampleCount > 0 ? (
                <p className="text-xs text-amber-600">
                  Gallery maturing ({status.sampleCount}/12 samples needed) — display-only mode
                </p>
              ) : null)}
              {status?.adaptiveThreshold != null && (
                <p className="text-xs text-muted-foreground">
                  Adaptive threshold: {status.adaptiveThreshold.toFixed(3)}
                  {status.thresholdConfidence != null ? ` (confidence: ${(status.thresholdConfidence * 100).toFixed(0)}%)` : ""}
                </p>
              )}
            </div>

            {/* Threshold slider */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Threshold</Label>
                <span className="text-xs font-mono tabular-nums text-muted-foreground">{threshold.toFixed(2)}</span>
              </div>
              <Slider
                value={[threshold]}
                onValueChange={handleThresholdChange}
                min={0.7}
                max={0.95}
                step={0.01}
              />
              <p className="text-xs text-muted-foreground">
                Higher values are stricter (fewer false accepts, more false rejects).
                Default: 0.85
              </p>
            </div>

            {/* Model download status */}
            {modelStatus.status === "loading" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                <Download className="h-3 w-3 animate-pulse" />
                <span>Downloading voice model ({Math.round(modelStatus.progress * 100)}%)…</span>
              </div>
            )}
            {modelStatus.status === "error" && (
              <p className="text-xs text-red-500 py-1">
                Voice model failed to load: {modelStatus.error}
              </p>
            )}

            {/* Enroll section */}
            <div className="space-y-2 pt-1">
              <Label className="text-sm font-medium">Enroll Your Voice</Label>
              <p className="text-xs text-muted-foreground">
                Say 1–3 short phrases (2–3 seconds each). Each recording improves accuracy.
                Gallery learns from daily use once enrolled (up to 30 samples).
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={recording ? stopRecording : startRecording}
                  disabled={enrolling || modelStatus.status === "loading"}
                  variant={recording ? "destructive" : "default"}
                >
                  {recording ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Recording...</>
                  ) : (
                    <><Mic className="h-4 w-4 mr-1" /> {isEnrolled ? "Add Sample" : "Record & Enroll"}</>
                  )}
                </Button>
                {enrolling && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Processing...
                  </span>
                )}
              </div>
              {enrollResult && (
                <p className="text-xs text-green-600">{enrollResult}</p>
              )}
            </div>

            {/* Reset */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={handleReset}
                disabled={resetting || !isEnrolled}
                className="text-red-500 hover:text-red-600"
              >
                {resetting ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Resetting...</>
                ) : (
                  <><Trash2 className="h-4 w-4 mr-1" /> Reset Enrollment</>
                )}
              </Button>
            </div>

            {/* Error */}
            {error && <p className="text-xs text-red-500">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
};
