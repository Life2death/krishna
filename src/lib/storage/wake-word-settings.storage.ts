import { STORAGE_KEYS } from "@/config";

export type EvaluationStatus = "collecting" | "ready_for_evaluation" | "passed" | "failed";
export type AudioSource = "builtin_mic" | "bluetooth_sco";

export interface WakeWordSettings {
  shadowModeEnabled: boolean;
  trainingConsent: boolean;
  positiveCount: number;
  negativeCount: number;
  environmentCount: number;
  startedAt: number;
  evaluationStatus: EvaluationStatus;
  activationApproved: boolean;
  modelVersion: string;
  threshold: number;
  lastScore: number;
  lastDetectorState: string;
  lastError: string;
  audioSource: AudioSource;
  recordingRetention: boolean;
}

export const DEFAULT_WAKE_WORD_SETTINGS: WakeWordSettings = {
  shadowModeEnabled: false,
  trainingConsent: false,
  positiveCount: 0,
  negativeCount: 0,
  environmentCount: 0,
  startedAt: 0,
  evaluationStatus: "collecting",
  activationApproved: false,
  modelVersion: "",
  threshold: 0.5,
  lastScore: 0,
  lastDetectorState: "idle",
  lastError: "",
  audioSource: "builtin_mic",
  recordingRetention: false,
};

const STORAGE_KEY = "krishna_wake_word_settings";

export const getWakeWordSettings = (): WakeWordSettings => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_WAKE_WORD_SETTINGS;
    const parsed = JSON.parse(stored);
    return {
      shadowModeEnabled: parsed.shadowModeEnabled ?? DEFAULT_WAKE_WORD_SETTINGS.shadowModeEnabled,
      trainingConsent: parsed.trainingConsent ?? DEFAULT_WAKE_WORD_SETTINGS.trainingConsent,
      positiveCount: parsed.positiveCount ?? DEFAULT_WAKE_WORD_SETTINGS.positiveCount,
      negativeCount: parsed.negativeCount ?? DEFAULT_WAKE_WORD_SETTINGS.negativeCount,
      environmentCount: parsed.environmentCount ?? DEFAULT_WAKE_WORD_SETTINGS.environmentCount,
      startedAt: parsed.startedAt ?? DEFAULT_WAKE_WORD_SETTINGS.startedAt,
      evaluationStatus: parsed.evaluationStatus ?? DEFAULT_WAKE_WORD_SETTINGS.evaluationStatus,
      activationApproved: parsed.activationApproved ?? DEFAULT_WAKE_WORD_SETTINGS.activationApproved,
      modelVersion: parsed.modelVersion ?? DEFAULT_WAKE_WORD_SETTINGS.modelVersion,
      threshold: parsed.threshold ?? DEFAULT_WAKE_WORD_SETTINGS.threshold,
      lastScore: parsed.lastScore ?? DEFAULT_WAKE_WORD_SETTINGS.lastScore,
      lastDetectorState: parsed.lastDetectorState ?? DEFAULT_WAKE_WORD_SETTINGS.lastDetectorState,
      lastError: parsed.lastError ?? DEFAULT_WAKE_WORD_SETTINGS.lastError,
      audioSource: parsed.audioSource ?? DEFAULT_WAKE_WORD_SETTINGS.audioSource,
      recordingRetention: parsed.recordingRetention ?? DEFAULT_WAKE_WORD_SETTINGS.recordingRetention,
    };
  } catch {
    return DEFAULT_WAKE_WORD_SETTINGS;
  }
};

export const setWakeWordSettings = (settings: WakeWordSettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save wake word settings:", error);
  }
};

export const updateShadowModeEnabled = (enabled: boolean): WakeWordSettings => {
  const current = getWakeWordSettings();
  const updated = { ...current, shadowModeEnabled: enabled };
  setWakeWordSettings(updated);
  return updated;
};

export const updateTrainingConsent = (consent: boolean): WakeWordSettings => {
  const current = getWakeWordSettings();
  const updated = {
    ...current,
    trainingConsent: consent,
    startedAt: consent && current.startedAt === 0 ? Date.now() : current.startedAt,
  };
  setWakeWordSettings(updated);
  return updated;
};

export const updateEvaluationStatus = (status: EvaluationStatus): WakeWordSettings => {
  const current = getWakeWordSettings();
  const updated = { ...current, evaluationStatus: status };
  setWakeWordSettings(updated);
  return updated;
};

export const updateActivationApproved = (approved: boolean): WakeWordSettings => {
  const current = getWakeWordSettings();
  const updated = {
    ...current,
    activationApproved: approved,
    evaluationStatus: approved ? "passed" : current.evaluationStatus,
  };
  setWakeWordSettings(updated);
  return updated;
};

export const updateAudioSource = (source: AudioSource): WakeWordSettings => {
  const current = getWakeWordSettings();
  const updated = { ...current, audioSource: source };
  setWakeWordSettings(updated);
  return updated;
};

export const updateRecordingRetention = (enabled: boolean): WakeWordSettings => {
  const current = getWakeWordSettings();
  const updated = { ...current, recordingRetention: enabled };
  setWakeWordSettings(updated);
  return updated;
};

export const resetWakeWordSettings = (): WakeWordSettings => {
  setWakeWordSettings(DEFAULT_WAKE_WORD_SETTINGS);
  return DEFAULT_WAKE_WORD_SETTINGS;
};

export const isReadinessGateMet = (settings: WakeWordSettings): boolean => {
  const hoursElapsed = settings.startedAt > 0
    ? (Date.now() - settings.startedAt) / 3_600_000
    : 0;
  return (
    settings.positiveCount >= 100 &&
    settings.negativeCount >= 200 &&
    settings.environmentCount >= 3 &&
    hoursElapsed >= 48
  );
};
