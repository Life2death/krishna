import { STORAGE_KEYS } from "@/config";
import {
  DEFAULT_RESPONSE_LENGTH,
  DEFAULT_LANGUAGE,
  DEFAULT_AUTO_SCROLL,
  DEFAULT_HONORIFIC,
  DEFAULT_VOICE_MAX_TOKENS,
  DEFAULT_VOICE_MODEL,
} from "../response-settings.constants";

export interface ResponseSettings {
  responseLength: string;
  language: string;
  autoScroll: boolean;
  honorific: string;
  voiceMaxTokens: number;
  voiceModel: string;
}

export const DEFAULT_RESPONSE_SETTINGS: ResponseSettings = {
  responseLength: DEFAULT_RESPONSE_LENGTH,
  language: DEFAULT_LANGUAGE,
  autoScroll: DEFAULT_AUTO_SCROLL,
  honorific: DEFAULT_HONORIFIC,
  voiceMaxTokens: DEFAULT_VOICE_MAX_TOKENS,
  voiceModel: DEFAULT_VOICE_MODEL,
};

/**
 * Get response settings from localStorage
 */
export const getResponseSettings = (): ResponseSettings => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.RESPONSE_SETTINGS);
    if (!stored) {
      return DEFAULT_RESPONSE_SETTINGS;
    }

    const parsedSettings = JSON.parse(stored);

    return {
      responseLength:
        parsedSettings.responseLength ||
        DEFAULT_RESPONSE_SETTINGS.responseLength,
      language: parsedSettings.language || DEFAULT_RESPONSE_SETTINGS.language,
      autoScroll:
        parsedSettings.autoScroll !== undefined
          ? parsedSettings.autoScroll
          : DEFAULT_RESPONSE_SETTINGS.autoScroll,
      honorific:
        parsedSettings.honorific || DEFAULT_RESPONSE_SETTINGS.honorific,
      // 100 was the pre-2026-07-17 default, not a user choice — it truncated
      // any completion carrying a Maps URL mid-action-block (see
      // DEFAULT_VOICE_MAX_TOKENS). Migrate it up; any other stored value is
      // a deliberate setting and is preserved.
      voiceMaxTokens:
        parsedSettings.voiceMaxTokens === 100 || parsedSettings.voiceMaxTokens == null
          ? DEFAULT_RESPONSE_SETTINGS.voiceMaxTokens
          : parsedSettings.voiceMaxTokens,
      voiceModel:
        parsedSettings.voiceModel ?? DEFAULT_RESPONSE_SETTINGS.voiceModel,
    };
  } catch (error) {
    console.error("Failed to get response settings:", error);
    return DEFAULT_RESPONSE_SETTINGS;
  }
};

/**
 * Save response settings to localStorage
 */
export const setResponseSettings = (settings: ResponseSettings): void => {
  try {
    localStorage.setItem(
      STORAGE_KEYS.RESPONSE_SETTINGS,
      JSON.stringify(settings)
    );
  } catch (error) {
    console.error("Failed to save response settings:", error);
  }
};

/**
 * Update response length
 */
export const updateResponseLength = (
  responseLength: string
): ResponseSettings => {
  const currentSettings = getResponseSettings();
  const newSettings = { ...currentSettings, responseLength };
  setResponseSettings(newSettings);
  return newSettings;
};

/**
 * Update language
 */
export const updateLanguage = (language: string): ResponseSettings => {
  const currentSettings = getResponseSettings();
  const newSettings = { ...currentSettings, language };
  setResponseSettings(newSettings);
  return newSettings;
};

/**
 * Update auto-scroll
 */
export const updateAutoScroll = (autoScroll: boolean): ResponseSettings => {
  const currentSettings = getResponseSettings();
  const newSettings = { ...currentSettings, autoScroll };
  setResponseSettings(newSettings);
  return newSettings;
};

/**
 * Update honorific
 */
export const updateHonorific = (honorific: string): ResponseSettings => {
  const currentSettings = getResponseSettings();
  const newSettings = { ...currentSettings, honorific };
  setResponseSettings(newSettings);
  return newSettings;
};

/**
 * Update voice max tokens
 */
export const updateVoiceMaxTokens = (voiceMaxTokens: number): ResponseSettings => {
  const currentSettings = getResponseSettings();
  const newSettings = { ...currentSettings, voiceMaxTokens };
  setResponseSettings(newSettings);
  return newSettings;
};

/**
 * Update voice model
 */
export const updateVoiceModel = (voiceModel: string): ResponseSettings => {
  const currentSettings = getResponseSettings();
  const newSettings = { ...currentSettings, voiceModel };
  setResponseSettings(newSettings);
  return newSettings;
};
