import { useEffect, useState, useCallback, useRef } from "react";
import { getVoiceStatus, isVoiceIdEnabled } from "@/lib/voice-client";
import { readBrainConfig, saveBrainConfig } from "@/lib/brain-config";
import type { VoiceStatus } from "@/lib/voice-client";

export type VoiceIdCardState = "empty" | "training" | "ready" | "active";

export interface VoiceStatusDerived {
  status: VoiceStatus | null;
  loading: boolean;
  error: string | null;
  percent: number;
  state: VoiceIdCardState;
  canEnable: boolean;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  refresh: () => Promise<void>;
}

export function useVoiceStatus(): VoiceStatusDerived {
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await getVoiceStatus();
      setStatus(s);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get voice status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    timerRef.current = setInterval(fetchStatus, 30_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchStatus]);

  const confidence = status?.thresholdConfidence ?? 0;
  const percent = Math.round(confidence * 100);
  const enabled = isVoiceIdEnabled();
  const canEnable = confidence >= 1;

  const setEnabled = useCallback((value: boolean) => {
    if (value && !canEnable) return;
    const cfg = readBrainConfig();
    cfg.voiceIdEnabled = value;
    saveBrainConfig(cfg);
    setTick(n => n + 1);
  }, [canEnable]);

  let state: VoiceIdCardState;
  if (status && status.sampleCount === 0) {
    state = "empty";
  } else if (confidence < 1) {
    state = "training";
  } else if (!enabled) {
    state = "ready";
  } else {
    state = "active";
  }

  return { status, loading, error, percent, state, canEnable, enabled, setEnabled, refresh: fetchStatus };
}
