import { useState, useEffect, useCallback } from "react";
import { Switch, Label, Header, Button } from "@/components";
import {
  getWakeWordSettings,
  updateShadowModeEnabled,
  updateTrainingConsent,
  updateEvaluationStatus,
  updateActivationApproved,
  updateAudioSource,
  updateRecordingRetention,
  resetWakeWordSettings,
  runLocalEvaluation,
  captureClip,
  getTrainingSummary,
  isReadinessGateMet,
} from "@/lib/storage/wake-word-settings.storage";
import type { WakeWordSettings as WakeWordSettingsType } from "@/lib/storage/wake-word-settings.storage";

export const WakeWordSettings = () => {
  const [settings, setSettings] = useState<WakeWordSettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [recording, setRecording] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const s = await getWakeWordSettings();
    setSettings(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleShadowToggle = async (checked: boolean) => {
    const updated = await updateShadowModeEnabled(checked);
    setSettings(updated);
  };

  const handleConsentToggle = async (checked: boolean) => {
    const updated = await updateTrainingConsent(checked);
    setSettings(updated);
  };

  const handleAudioSourceChange = async (source: "builtin_mic" | "bluetooth_sco") => {
    const updated = await updateAudioSource(source);
    setSettings(updated);
  };

  const handleRetentionToggle = async (checked: boolean) => {
    const updated = await updateRecordingRetention(checked);
    setSettings(updated);
  };

  const handleRecordClip = async (label: string) => {
    if (recording) return;
    setRecording(true);
    const result = await captureClip(label);
    setRecording(false);
    if (result.success) {
      const updated = await getWakeWordSettings();
      setSettings(updated);
    } else {
      alert("Recording failed: " + (result.error || "unknown error"));
    }
  };

  const handleRunEvaluation = async () => {
    setEvaluating(true);
    const result = await runLocalEvaluation();
    setEvaluating(false);
    if (result.success) {
      const updated = await getWakeWordSettings();
      setSettings(updated);
    } else {
      alert("Evaluation failed: " + (result.error || "unknown error"));
    }
  };

  const handleApprove = async () => {
    try {
      const updated = await updateActivationApproved(true);
      setSettings(updated);
    } catch (err: unknown) {
      alert("Approval denied: " + (err instanceof Error ? err.message : String(err)));
      const updated = await getWakeWordSettings();
      setSettings(updated);
    }
  };

  const handleReset = async () => {
    const updated = await resetWakeWordSettings();
    setSettings(updated);
    setShowResetConfirm(false);
  };

  if (loading || !settings) {
    return (
      <div className="space-y-4 border-t pt-4">
        <Header title="Wake Word" description="Loading..." isMainTitle />
      </div>
    );
  }

  const readinessMet = isReadinessGateMet(settings);
  const hoursElapsed = settings.startedAt > 0
    ? Math.floor((Date.now() - settings.startedAt) / 3_600_000)
    : 0;

  return (
    <div className="space-y-4 border-t pt-4">
      <Header
        title="Wake Word"
        description="Configure local OpenWakeWord 'Hey Krishna' detection on Android"
        isMainTitle
      />

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Shadow mode</Label>
          <p className="text-xs text-muted-foreground mt-1">
            {settings.enabled
              ? "OpenWakeWord detection is enabled"
              : "Wake-word detection is disabled"}
          </p>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={handleShadowToggle}
          aria-label="Toggle shadow mode"
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Training data consent</Label>
          <p className="text-xs text-muted-foreground mt-1">
            {settings.consentGrantedAt > 0
              ? "Consent granted — clips may be stored locally for model improvement"
              : "Opt in to save training clips for wake-word improvement"}
          </p>
        </div>
        <Switch
          checked={settings.consentGrantedAt > 0}
          onCheckedChange={handleConsentToggle}
          aria-label="Toggle training consent"
        />
      </div>

      {settings.consentGrantedAt > 0 && (
        <div className="space-y-3 border border-border/20 rounded-lg p-3 bg-muted/10">
          <p className="text-xs text-muted-foreground">
            When enabled, Krishna can store short (&lt;3s) audio clips on this device
            to improve wake-word accuracy. Clips are never transmitted off-device.
          </p>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded bg-background p-2 text-center">
              <span className="font-mono font-bold">{settings.positiveCount}</span>
              <p className="text-muted-foreground">Positive</p>
            </div>
            <div className="rounded bg-background p-2 text-center">
              <span className="font-mono font-bold">{settings.negativeCount}</span>
              <p className="text-muted-foreground">Negative</p>
            </div>
            <div className="rounded bg-background p-2 text-center">
              <span className="font-mono font-bold">{settings.environmentCount}</span>
              <p className="text-muted-foreground">Environments</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleRecordClip("positive")} disabled={recording}>
              {recording ? "Recording (3s)..." : "Record \"Hey Krishna\""}
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleRecordClip("negative")} disabled={recording}>
              {recording ? "Recording…" : "Record background"}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Keep recordings after evaluation</Label>
            <Switch
              checked={settings.recordingRetentionEnabled}
              onCheckedChange={handleRetentionToggle}
              aria-label="Toggle recording retention"
            />
          </div>
        </div>
      )}

      {settings.consentGrantedAt > 0 && (
        <div className="space-y-3 border border-border/20 rounded-lg p-3 bg-muted/10">
          <Label className="text-sm font-medium">Readiness gate</Label>
          <div className="text-xs space-y-1">
            <p className={settings.positiveCount >= 100 ? "text-green-500" : "text-muted-foreground"}>
              {settings.positiveCount >= 100 ? "✓" : "○"} {settings.positiveCount}/100 positive clips
            </p>
            <p className={settings.negativeCount >= 200 ? "text-green-500" : "text-muted-foreground"}>
              {settings.negativeCount >= 200 ? "✓" : "○"} {settings.negativeCount}/200 negative clips
            </p>
            <p className={settings.environmentCount >= 3 ? "text-green-500" : "text-muted-foreground"}>
              {settings.environmentCount >= 3 ? "✓" : "○"} {settings.environmentCount}/3 environments
            </p>
            <p className={hoursElapsed >= 48 ? "text-green-500" : "text-muted-foreground"}>
              {hoursElapsed >= 48 ? "✓" : "○"} {hoursElapsed}/48 hours elapsed
            </p>
          </div>

          {readinessMet && settings.evaluationStatus === "collecting" && (
            <Button size="sm" onClick={handleRunEvaluation} disabled={evaluating}>
              {evaluating ? "Evaluating…" : "Run local evaluation"}
            </Button>
          )}

          {settings.evaluationResult.sampleCount > 0 && (
            <div className="text-xs space-y-1 font-mono mt-2">
              <p className="text-muted-foreground">Last evaluation: recall={settings.evaluationResult.recall.toFixed(3)} falseWakeRate={settings.evaluationResult.falseWakeRate.toFixed(3)} samples={settings.evaluationResult.sampleCount} model={settings.evaluationResult.modelVersion}</p>
            </div>
          )}

          {settings.evaluationStatus === "ready_for_approval" && settings.activationApprovedAt === 0 && (
            <div className="space-y-2">
              <p className="text-xs text-green-600">Evaluation passed. Awaiting your approval.</p>
              {!settings.recordingRetentionEnabled && (
                <p className="text-xs text-amber-500">Enable "Keep recordings" above before approving.</p>
              )}
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={!settings.recordingRetentionEnabled}
              >
                Approve and activate wake word
              </Button>
            </div>
          )}

          {settings.evaluationStatus === "approved" && (
            <p className="text-xs text-green-600">Wake word is approved and active.</p>
          )}

          {settings.evaluationStatus === "failed" && (
            <div className="space-y-2">
              <p className="text-xs text-red-500">
                Evaluation did not meet quality targets. Current model has recall={settings.evaluationResult.recall.toFixed(3)} and falseWakeRate={settings.evaluationResult.falseWakeRate.toFixed(3)} — targets are recall≥0.80 and falseWakeRate≤0.10. Collect more high-quality clips then retrain (see below).
              </p>
            </div>
          )}

          <div className="mt-3 space-y-2 border-t border-border/10 pt-3">
            <p className="text-xs font-medium">Retraining workflow</p>
            <p className="text-xs text-muted-foreground">
              Local clips do not automatically improve the model. To retrain:
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Pull clips from device: <code className="bg-muted/20 px-1">adb pull /sdcard/Android/data/com.krishna.assistant/files/wake_word_training/ training/data/</code></li>
              <li>Run training: <code className="bg-muted/20 px-1">python training/openwakeword/train_model.py</code></li>
              <li>Verify: <code className="bg-muted/20 px-1">python training/openwakeword/verify_export.py</code></li>
              <li>Copy <code className="bg-muted/20 px-1">export/model.tflite</code> and <code className="bg-muted/20 px-1">export/manifest.json</code> to Android assets</li>
              <li>Rebuild and re-run evaluation</li>
            </ol>
          </div>
        </div>
      )}

      <div className="space-y-3 border border-border/20 rounded-lg p-3 bg-muted/10">
        <Label className="text-sm font-medium">Model & diagnostics</Label>
        <div className="text-xs space-y-1 text-muted-foreground font-mono">
          <p>Model: {settings.modelVersion || "none"}</p>
          <p>Threshold: {settings.threshold}</p>
          <p>Last score: {settings.lastScore}</p>
          <p>State: {settings.lastDetectorState}</p>
          {settings.lastError && <p className="text-red-500">Error: {settings.lastError}</p>}
        </div>
      </div>

      <div className="space-y-2 border border-border/20 rounded-lg p-3 bg-muted/10">
        <Label className="text-sm font-medium">Microphone source</Label>
        <p className="text-xs text-muted-foreground">
          {settings.audioSource === "bluetooth_sco"
            ? "Using Bluetooth headset microphone (may affect music quality)"
            : "Using built-in phone microphone"}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={settings.audioSource === "builtin_mic" ? "default" : "outline"}
            onClick={() => handleAudioSourceChange("builtin_mic")}
          >
            Built-in mic
          </Button>
          <Button
            size="sm"
            variant={settings.audioSource === "bluetooth_sco" ? "default" : "outline"}
            onClick={() => handleAudioSourceChange("bluetooth_sco")}
          >
            Bluetooth headset
          </Button>
        </div>
        {settings.audioSource === "bluetooth_sco" && (
          <p className="text-xs text-amber-500">
            Bluetooth SCO mode can reduce music playback quality. Only enable if
            you need the headset microphone for wake detection.
          </p>
        )}
      </div>

      <div className="border-t border-border/10 pt-3">
        {showResetConfirm ? (
          <div className="space-y-2">
            <p className="text-xs text-red-500">
              This will delete all training clips, counters, and evaluation results.
              This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleReset}>
                Confirm reset
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowResetConfirm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setShowResetConfirm(true)}>
            Reset/delete local wake-word data
          </Button>
        )}
      </div>
    </div>
  );
};
