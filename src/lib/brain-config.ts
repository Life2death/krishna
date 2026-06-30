export interface BrainConfig {
  brainMode: "local" | "remote";
  brainUrl: string;
  brainToken: string;
  voiceIdEnabled?: boolean;
  voiceThreshold?: number;
}

const STORAGE_KEY = "krishna_brain_config";

export function readBrainConfig(): BrainConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        brainMode: "local",
        brainUrl: parsed.brainUrl || "http://localhost:8787",
        brainToken: parsed.brainToken || "",
        voiceIdEnabled: parsed.voiceIdEnabled ?? false,
        voiceThreshold: parsed.voiceThreshold ?? 0.85,
      };
    }
  } catch {}
  return { brainMode: "local", brainUrl: "http://localhost:8787", brainToken: "", voiceIdEnabled: false, voiceThreshold: 0.85 };
}

export function saveBrainConfig(config: BrainConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
