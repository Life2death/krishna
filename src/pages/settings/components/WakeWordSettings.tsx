import { useState, useEffect } from "react";
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
  isReadinessGateMet,
} from "@/lib/storage/wake-word-settings.storage";
import type { WakeWordSettings as WakeWordSettingsType } from "@/lib/storage/wake-word-settings.storage";

export const WakeWordSettings = () => {
  const [settings, setSettings] = useState<WakeWordSettingsType>(getWakeWordSettings);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    setSettings(getWakeWordSettings());
  }, []);

  const refresh = () => setSettings(getWakeWordSettings());

  const handleShadowToggle = (checked: boolean) => {
    updateShadowModeEnabled(checked);
    refresh();
  };

  const handleConsentToggle = (checked: boolean) => {
    updateTrainingConsent(checked);
    refresh();
  };

  const handleAudioSourceChange = (source: "builtin_mic" | "bluetooth_sco") => {
    updateAudioSource(source);
    refresh();
  };

  const handleRetentionToggle = (checked: boolean) => {
    updateRecordingRetention(checked);
    refresh();
  };

  const handleRunEvaluation = () => {
    updateEvaluationStatus("passed");
    refresh();
  };

  const handleApprove = () => {
    updateActivationApproved(true);
    refresh();
  };

  const handleReset = () => {
    resetWakeWordSettings();
    setShowResetConfirm(false);
    refresh();
  };

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
            {settings.shadowModeEnabled
              ? "OpenWakeWord detection is enabled"
              : "Wake-word detection is disabled"}
          </p>
        </div>
        <Switch
          checked={settings.shadowModeEnabled}
          onCheckedChange={handleShadowToggle}
          aria-label="Toggle shadow mode"
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Training data consent</Label>
          <p className="text-xs text-muted-foreground mt-1">
            {settings.trainingConsent
              ? "Consent granted — clips may be stored locally for model improvement"
              : "Opt in to save training clips for wake-word improvement"}
          </p>
        </div>
        <Switch
          checked={settings.trainingConsent}
          onCheckedChange={handleConsentToggle}
          aria-label="Toggle training consent"
        />
      </div>

      {settings.trainingConsent && (
        <div className="space-y-3 border border-border/20 rounded-lg p-3 bg-muted/10">
          <p className="text-xs text-muted-foreground">
            When enabled, Krishna can store short ({'<'}3s) audio clips on this device
            to improve wake-word accuracy. Clips are never transmitted off-device.
            Current storage is in app-private storage.
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

          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Keep recordings after evaluation</Label>
            <Switch
              checked={settings.recordingRetention}
              onCheckedChange={handleRetentionToggle}
              aria-label="Toggle recording retention"
            />
          </div>
        </div>
      )}

      {settings.trainingConsent && (
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
            <Button size="sm" onClick={handleRunEvaluation}>
              Run local evaluation
            </Button>
          )}

          {settings.evaluationStatus === "passed" && !settings.activationApproved && (
            <div className="space-y-2">
              <p className="text-xs text-green-600">Evaluation passed. Awaiting your approval.</p>
              <Button size="sm" onClick={handleApprove}>
                Approve and enable OpenWakeWord
              </Button>
            </div>
          )}

          {settings.activationApproved && (
            <p className="text-xs text-green-600">OpenWakeWord is approved and active.</p>
          )}

          {settings.evaluationStatus === "failed" && (
            <p className="text-xs text-red-500">
              Evaluation did not meet quality targets. Collect more samples and try again.
            </p>
          )}
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
