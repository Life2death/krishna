import { describe, it, expect, beforeEach, vi } from "vitest";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
  };
})();

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
  writable: true,
});

import {
  getLiveVoiceSettings,
  updateLiveVoiceMode,
  updateLiveVoiceAutoStart,
  updateLiveVoiceVoice,
  updateLiveVoiceLanguage,
  updateInactivityTimeout,
  updateMaxSessionDuration,
  DEFAULT_LIVE_VOICE_SETTINGS,
} from "@/lib/storage/live-voice-settings.storage";
import {
  getCustomizableState,
  updateLiveVoiceMode as updateCustomizableLiveVoiceMode,
} from "@/lib/storage/customizable.storage";

const STORAGE_KEY = "live_voice_settings";

describe("live-voice-settings.storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("getLiveVoiceSettings returns defaults when nothing stored", () => {
    const settings = getLiveVoiceSettings();
    expect(settings).toEqual(DEFAULT_LIVE_VOICE_SETTINGS);
  });

  it("updateLiveVoiceMode persists mode", () => {
    const updated = updateLiveVoiceMode("live");
    expect(updated.mode).toBe("live");

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.mode).toBe("live");

    const reloaded = getLiveVoiceSettings();
    expect(reloaded.mode).toBe("live");
  });

  it("updateLiveVoiceAutoStart persists autoStart", () => {
    const updated = updateLiveVoiceAutoStart(true);
    expect(updated.autoStart).toBe(true);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.autoStart).toBe(true);

    const reloaded = getLiveVoiceSettings();
    expect(reloaded.autoStart).toBe(true);
  });

  it("updateLiveVoiceVoice persists voice", () => {
    const updated = updateLiveVoiceVoice("cedar");
    expect(updated.voice).toBe("cedar");

    const reloaded = getLiveVoiceSettings();
    expect(reloaded.voice).toBe("cedar");
  });

  it("updateLiveVoiceLanguage persists language", () => {
    const updated = updateLiveVoiceLanguage("hindi");
    expect(updated.language).toBe("hindi");

    const reloaded = getLiveVoiceSettings();
    expect(reloaded.language).toBe("hindi");
  });

  it("updateInactivityTimeout persists timeout", () => {
    const updated = updateInactivityTimeout(60000);
    expect(updated.inactivityTimeoutMs).toBe(60000);

    const reloaded = getLiveVoiceSettings();
    expect(reloaded.inactivityTimeoutMs).toBe(60000);
  });

  it("updateMaxSessionDuration persists duration", () => {
    const updated = updateMaxSessionDuration(3600000);
    expect(updated.maxSessionDurationMs).toBe(3600000);

    const reloaded = getLiveVoiceSettings();
    expect(reloaded.maxSessionDurationMs).toBe(3600000);
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem(STORAGE_KEY, "invalid json");
    const settings = getLiveVoiceSettings();
    expect(settings).toEqual(DEFAULT_LIVE_VOICE_SETTINGS);
  });

  it("customizable live mode enables the main Live Voice entrypoint", () => {
    const updated = updateCustomizableLiveVoiceMode("live");
    expect(updated.liveVoice.mode).toBe("live");
    expect(updated.liveVoice.enabled).toBe(true);

    const reloaded = getCustomizableState();
    expect(reloaded.liveVoice.mode).toBe("live");
    expect(reloaded.liveVoice.enabled).toBe(true);
  });

  it("customizable classic mode disables the main Live Voice entrypoint", () => {
    updateCustomizableLiveVoiceMode("live");
    const updated = updateCustomizableLiveVoiceMode("classic");
    expect(updated.liveVoice.mode).toBe("classic");
    expect(updated.liveVoice.enabled).toBe(false);
  });
});
