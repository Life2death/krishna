import { STORAGE_KEYS } from "@/config";

export type EvaluationStatus = "collecting" | "ready_for_approval" | "approved" | "failed";
export type AudioSource = "builtin_mic" | "bluetooth_sco";

export interface EvaluationResult {
  recall: number;
  falseWakeRate: number;
  sampleCount: number;
  evaluatedAt: number;
  modelVersion: string;
}

export interface WakeWordSettings {
  enabled: boolean;
  modelVersion: string;
  consentGrantedAt: number;
  positiveCount: number;
  negativeCount: number;
  environmentCount: number;
  startedAt: number;
  evaluationStatus: EvaluationStatus;
  activationApprovedAt: number;
  lastError: string;
  audioSource: AudioSource;
  threshold: number;
  lastScore: number;
  lastFrameCount: number;
  lastDetectorState: string;
  recordingRetentionEnabled: boolean;
  evaluationResult: EvaluationResult;
}

export const DEFAULT_WAKE_WORD_SETTINGS: WakeWordSettings = {
  enabled: false,
  modelVersion: "",
  consentGrantedAt: 0,
  positiveCount: 0,
  negativeCount: 0,
  environmentCount: 0,
  startedAt: 0,
  evaluationStatus: "collecting",
  activationApprovedAt: 0,
  lastError: "",
  audioSource: "builtin_mic",
  threshold: 0.5,
  lastScore: 0,
  lastFrameCount: 0,
  lastDetectorState: "idle",
  recordingRetentionEnabled: false,
  evaluationResult: {
    recall: 0,
    falseWakeRate: 0,
    sampleCount: 0,
    evaluatedAt: 0,
    modelVersion: "",
  },
};

const LOCAL_KEY = "krishna_wake_word_settings";

function isAndroid(): boolean {
  return typeof window !== "undefined" && (
    "flutter" in window || "__TAURI__" in window || "__TAURI_INTERNALS__" in window
  );
}

async function bridgeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = (window as unknown as Record<string, unknown>).__TAURI__ as
    | { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
    | undefined;
  if (tauri?.invoke) {
    return tauri.invoke(cmd, args) as Promise<T>;
  }
  const internals = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ as
    | { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> }
    | undefined;
  if (internals?.invoke) {
    return internals.invoke(cmd, args) as Promise<T>;
  }
  throw new Error("Tauri IPC not available");
}

function loadLocal(): WakeWordSettings {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { ...DEFAULT_WAKE_WORD_SETTINGS };
    return { ...DEFAULT_WAKE_WORD_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_WAKE_WORD_SETTINGS };
  }
}

function saveLocal(settings: WakeWordSettings): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Failed to save wake word settings:", e);
  }
}

export const getWakeWordSettings = async (): Promise<WakeWordSettings> => {
  if (!isAndroid()) return loadLocal();
  try {
    const raw = await bridgeInvoke<string>("android_get_wake_word_profile");
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_WAKE_WORD_SETTINGS,
      ...parsed,
      enabled: parsed.enabled ?? false,
      evaluationResult: {
        ...DEFAULT_WAKE_WORD_SETTINGS.evaluationResult,
        ...(parsed.evaluationResult || {}),
      },
    };
  } catch {
    return loadLocal();
  }
};

export const setWakeWordSettings = async (settings: WakeWordSettings): Promise<void> => {
  if (!isAndroid()) {
    saveLocal(settings);
    return;
  }
  try {
    await bridgeInvoke("android_update_wake_word_field", {
      field: "enabled",
      value: String(settings.enabled),
    });
  } catch {
    saveLocal(settings);
  }
};

export const updateShadowModeEnabled = async (enabled: boolean): Promise<WakeWordSettings> => {
  if (isAndroid()) {
    try {
      await bridgeInvoke("android_update_wake_word_field", {
        field: "enabled",
        value: String(enabled),
      });
    } catch { /* fallback below */ }
  }
  const current = await getWakeWordSettings();
  const updated = { ...current, enabled };
  if (!isAndroid()) saveLocal(updated);
  return updated;
};

export const updateTrainingConsent = async (consent: boolean): Promise<WakeWordSettings> => {
  if (isAndroid()) {
    try {
      await bridgeInvoke("android_update_wake_word_field", {
        field: "consentGranted",
        value: String(consent),
      });
    } catch { /* fallback */ }
  }
  const current = await getWakeWordSettings();
  const updated = {
    ...current,
    consentGrantedAt: consent && current.consentGrantedAt === 0 ? Date.now() : current.consentGrantedAt,
    startedAt: consent && current.startedAt === 0 ? Date.now() : current.startedAt,
  };
  if (!isAndroid()) saveLocal(updated);
  return updated;
};

export const updateEvaluationStatus = async (status: EvaluationStatus): Promise<WakeWordSettings> => {
  if (isAndroid()) {
    try {
      await bridgeInvoke("android_update_wake_word_field", {
        field: "evaluationStatus",
        value: status,
      });
    } catch { /* fallback */ }
  }
  const current = await getWakeWordSettings();
  const updated = { ...current, evaluationStatus: status };
  if (!isAndroid()) saveLocal(updated);
  return updated;
};

export const updateActivationApproved = async (approved: boolean): Promise<WakeWordSettings> => {
  if (isAndroid()) {
    const success = await bridgeInvoke<boolean>("android_update_wake_word_field", {
      field: "activationApproved",
      value: String(approved),
    });
    const current = await getWakeWordSettings();
    if (!success) {
      throw new Error(current.lastError || "Activation approval denied");
    }
    return current;
  }
  const current = await getWakeWordSettings();
  const updated = {
    ...current,
    activationApprovedAt: approved ? Date.now() : 0,
    evaluationStatus: approved ? "approved" : current.evaluationStatus,
  };
  saveLocal(updated);
  return updated;
};

export const updateAudioSource = async (source: AudioSource): Promise<WakeWordSettings> => {
  if (isAndroid()) {
    try {
      await bridgeInvoke("android_update_wake_word_field", {
        field: "audioSource",
        value: source,
      });
    } catch { /* fallback */ }
  }
  const current = await getWakeWordSettings();
  const updated = { ...current, audioSource: source };
  if (!isAndroid()) saveLocal(updated);
  return updated;
};

export const updateRecordingRetention = async (enabled: boolean): Promise<WakeWordSettings> => {
  if (isAndroid()) {
    try {
      await bridgeInvoke("android_update_wake_word_field", {
        field: "recordingRetention",
        value: String(enabled),
      });
    } catch { /* fallback */ }
  }
  const current = await getWakeWordSettings();
  const updated = { ...current, recordingRetentionEnabled: enabled };
  if (!isAndroid()) saveLocal(updated);
  return updated;
};

export const captureClip = async (label: string): Promise<{ success: boolean; clipId?: string; sha256?: string; error?: string }> => {
  if (isAndroid()) {
    try {
      const raw = await bridgeInvoke<string>("android_capture_clip", { label });
      return JSON.parse(raw);
    } catch {
      return { success: false, error: "Bridge invoke failed" };
    }
  }
  return { success: true, clipId: "desktop-sim", sha256: "sim" };
};

export const getTrainingSummary = async (): Promise<{ clipCount: number; positiveCount: number; negativeCount: number; environmentCount: number; totalStorageFormatted: string }> => {
  if (isAndroid()) {
    try {
      const raw = await bridgeInvoke<string>("android_training_summary");
      return JSON.parse(raw);
    } catch {
      return { clipCount: 0, positiveCount: 0, negativeCount: 0, environmentCount: 0, totalStorageFormatted: "0 B" };
    }
  }
  return { clipCount: 0, positiveCount: 0, negativeCount: 0, environmentCount: 0, totalStorageFormatted: "0 B" };
};

export const runLocalEvaluation = async (): Promise<{ success: boolean; recall?: number; falseWakeRate?: number; sampleCount?: number; error?: string }> => {
  if (isAndroid()) {
    try {
      const raw = await bridgeInvoke<string>("android_run_wake_word_evaluation");
      return JSON.parse(raw);
    } catch {
      return { success: false, error: "Bridge invoke failed" };
    }
  }
  // Desktop: simulated pass for development
  return { success: true, recall: 1.0, falseWakeRate: 0.0, sampleCount: 10 };
};

export const resetWakeWordSettings = async (): Promise<WakeWordSettings> => {
  if (isAndroid()) {
    try {
      await bridgeInvoke("android_reset_wake_word_profile");
    } catch { /* fallback */ }
  }
  saveLocal({ ...DEFAULT_WAKE_WORD_SETTINGS });
  return { ...DEFAULT_WAKE_WORD_SETTINGS };
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
