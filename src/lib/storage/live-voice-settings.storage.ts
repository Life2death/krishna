import { STORAGE_KEYS } from "@/config";

export type VoiceMode = "classic" | "live";
export type LiveProvider = "openai" | "gemini";

export interface LiveVoiceSettings {
  mode: VoiceMode;
  provider: LiveProvider;
  geminiModel: string;
  autoStart: boolean;
  voice: string;
  language: string;
  inactivityTimeoutMs: number;
  maxSessionDurationMs: number;
}

export const DEFAULT_LIVE_VOICE_SETTINGS: LiveVoiceSettings = {
  mode: "classic",
  provider: "openai",
  geminiModel: "models/gemini-2.5-flash-native-audio-preview-12-2025",
  autoStart: false,
  voice: "marin",
  language: "english",
  inactivityTimeoutMs: 5 * 60 * 1000,
  maxSessionDurationMs: 30 * 60 * 1000,
};

export const LIVE_VOICE_OPTIONS = {
  providers: [
    { id: "openai", name: "OpenAI Realtime" },
    { id: "gemini", name: "Google Gemini Live" },
  ],
  voices: [
    { id: "marin", name: "Marin" },
    { id: "cedar", name: "Cedar" },
    { id: "alloy", name: "Alloy" },
    { id: "echo", name: "Echo" },
    { id: "shimmer", name: "Shimmer" },
  ],
  languages: [
    { id: "english", name: "English" },
    { id: "hindi", name: "Hindi" },
    { id: "marathi", name: "Marathi" },
    { id: "hinglish", name: "Hinglish" },
  ],
  inactivityOptions: [
    { id: 60000, name: "1 minute" },
    { id: 180000, name: "3 minutes" },
    { id: 300000, name: "5 minutes" },
    { id: 600000, name: "10 minutes" },
    { id: 0, name: "Never" },
  ],
  maxDurationOptions: [
    { id: 600000, name: "10 minutes" },
    { id: 1800000, name: "30 minutes" },
    { id: 3600000, name: "1 hour" },
    { id: 0, name: "No limit" },
  ],
};

export const getLiveVoiceSettings = (): LiveVoiceSettings => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.LIVE_VOICE_SETTINGS);
    if (!stored) return DEFAULT_LIVE_VOICE_SETTINGS;

    const parsed = JSON.parse(stored);

    return {
      mode: parsed.mode ?? DEFAULT_LIVE_VOICE_SETTINGS.mode,
      provider: parsed.provider ?? DEFAULT_LIVE_VOICE_SETTINGS.provider,
      geminiModel: parsed.geminiModel ?? DEFAULT_LIVE_VOICE_SETTINGS.geminiModel,
      autoStart: parsed.autoStart ?? DEFAULT_LIVE_VOICE_SETTINGS.autoStart,
      voice: parsed.voice ?? DEFAULT_LIVE_VOICE_SETTINGS.voice,
      language: parsed.language ?? DEFAULT_LIVE_VOICE_SETTINGS.language,
      inactivityTimeoutMs:
        parsed.inactivityTimeoutMs ?? DEFAULT_LIVE_VOICE_SETTINGS.inactivityTimeoutMs,
      maxSessionDurationMs:
        parsed.maxSessionDurationMs ?? DEFAULT_LIVE_VOICE_SETTINGS.maxSessionDurationMs,
    };
  } catch {
    return DEFAULT_LIVE_VOICE_SETTINGS;
  }
};

export const setLiveVoiceSettings = (settings: LiveVoiceSettings): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.LIVE_VOICE_SETTINGS, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save live voice settings:", error);
  }
};

export const updateLiveVoiceMode = (mode: VoiceMode): LiveVoiceSettings => {
  const current = getLiveVoiceSettings();
  const updated = { ...current, mode };
  setLiveVoiceSettings(updated);
  return updated;
};

export const updateLiveVoiceProvider = (provider: LiveProvider): LiveVoiceSettings => {
  const current = getLiveVoiceSettings();
  const updated = { ...current, provider };
  setLiveVoiceSettings(updated);
  return updated;
};

export const updateGeminiModel = (geminiModel: string): LiveVoiceSettings => {
  const current = getLiveVoiceSettings();
  const updated = { ...current, geminiModel };
  setLiveVoiceSettings(updated);
  return updated;
};

export const updateLiveVoiceAutoStart = (autoStart: boolean): LiveVoiceSettings => {
  const current = getLiveVoiceSettings();
  const updated = { ...current, autoStart };
  setLiveVoiceSettings(updated);
  return updated;
};

export const updateLiveVoiceVoice = (voice: string): LiveVoiceSettings => {
  const current = getLiveVoiceSettings();
  const updated = { ...current, voice };
  setLiveVoiceSettings(updated);
  return updated;
};

export const updateLiveVoiceLanguage = (language: string): LiveVoiceSettings => {
  const current = getLiveVoiceSettings();
  const updated = { ...current, language };
  setLiveVoiceSettings(updated);
  return updated;
};

export const updateInactivityTimeout = (inactivityTimeoutMs: number): LiveVoiceSettings => {
  const current = getLiveVoiceSettings();
  const updated = { ...current, inactivityTimeoutMs };
  setLiveVoiceSettings(updated);
  return updated;
};

export const updateMaxSessionDuration = (maxSessionDurationMs: number): LiveVoiceSettings => {
  const current = getLiveVoiceSettings();
  const updated = { ...current, maxSessionDurationMs };
  setLiveVoiceSettings(updated);
  return updated;
};
