import { useState, useEffect, useRef, useCallback } from "react";
import { Switch, Label, Header, Button, Slider } from "@/components";
import { readBrainConfig, saveBrainConfig } from "@/lib/remote";
import {
  getVoiceStatus,
  enrollVoice,
  resetEnrollment,
  isVoiceIdEnabled,
} from "@/lib/voice-client";
import type { VoiceStatus } from "@/lib/voice-client";
import { floatArrayToWav } from "@/lib/utils";
import { Mic, Trash2, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";

export const VoiceIdSettings = () => {
  const [enabled, setEnabled] = useState(isVoiceIdEnabled());
  const [threshold, setThreshold] = useState(readBrainConfig().voiceThreshold ?? 0.85);
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrollResult, setEnrollResult] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await getVoiceStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

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

  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => { t.stop(); t.enabled = false; });
      streamRef.current = null;
    }
  }, []);

  const startRecording = async () => {
    setError(null);
    setEnrollResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => handleEnroll();
      recorder.start(100);
      setRecording(true);
    } catch (err) {
      setError("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const handleEnroll = async () => {
    const chunks = [...audioChunksRef.current];
    cleanup();
    if (chunks.length === 0) return;
    setEnrolling(true);
    try {
      const recordedBlob = new Blob(chunks, { type: mediaRecorderRef.current?.mimeType || "audio/webm" });
      // Decode webm/ogg → raw PCM → WAV at 16kHz for the brain
      const arrayBuffer = await recordedBlob.arrayBuffer();
      const audioCtx = new AudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const pcm = audioBuffer.getChannelData(0);
      const wavBlob = floatArrayToWav(pcm, audioBuffer.sampleRate, "wav");
      await audioCtx.close();
      const result = await enrollVoice(wavBlob);
      setEnrollResult(`Enrolled (${result.sampleCount} sample${result.sampleCount > 1 ? "s" : ""}, ${result.dims} dims)`);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrollment failed");
    } finally {
      setEnrolling(false);
    }
  };

  const handleReset = async () => {
    setError(null);
    setEnrollResult(null);
    setResetting(true);
    try {
      await resetEnrollment();
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const isEnrolled = status?.enrolled ?? false;

  return (
    <div id="voice-id" className="space-y-3">
      <Header
        title="Voice ID"
        description="Speaker verification: only allow your voice to execute commands. Voice ID must be enabled in the brain (.env: KRISHNA_VOICE_ID_ENABLED=true)."
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
            <div className="flex items-center gap-2 text-sm">
              {statusLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : isEnrolled ? (
                <ShieldCheck className="h-4 w-4 text-green-500" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-amber-500" />
              )}
              <span className={isEnrolled ? "text-green-600" : "text-amber-600"}>
                {statusLoading ? "Checking..." : isEnrolled ? `Enrolled (${status!.sampleCount} sample${status!.sampleCount > 1 ? "s" : ""})` : "Not enrolled"}
              </span>
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

            {/* Enroll section */}
            <div className="space-y-2 pt-1">
              <Label className="text-sm font-medium">Enroll Your Voice</Label>
              <p className="text-xs text-muted-foreground">
                Say 1–3 short phrases (2–3 seconds each) into your microphone. Each recording improves accuracy.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={recording ? stopRecording : startRecording}
                  disabled={enrolling}
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
