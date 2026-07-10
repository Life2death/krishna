import { useState, useEffect } from "react";
import { Switch, Label, Header, Selection } from "@/components";
import { useApp } from "@/contexts";
import { secureStorage } from "@/lib/secure-storage";

const STORAGE_KEY_REALTIME_KEY = "openai_realtime_api_key";
const STORAGE_KEY_GEMINI_KEY = "gemini_realtime_api_key";
import {
  getLiveVoiceSettings,
  updateLiveVoiceMode,
  updateLiveVoiceAutoStart,
  updateLiveVoiceVoice,
  updateLiveVoiceLanguage,
  updateInactivityTimeout,
  updateMaxSessionDuration,
  updateLiveVoiceProvider,
  updateGeminiModel,
  LIVE_VOICE_OPTIONS,
} from "@/lib/storage/live-voice-settings.storage";
import type { VoiceMode, LiveProvider } from "@/lib/storage/live-voice-settings.storage";

export const LiveVoiceSettings = () => {
  const { customizable, toggleLiveVoiceMode, toggleLiveVoiceAutoStart } = useApp();

  const liveVoice = customizable?.liveVoice;
  const [mode, setMode] = useState<VoiceMode>(liveVoice?.mode ?? "classic");
  const [autoStart, setAutoStart] = useState(liveVoice?.autoStart ?? false);
  const [voice, setVoice] = useState("marin");
  const [language, setLanguage] = useState("english");
  const [inactivityMs, setInactivityMs] = useState(300000);
  const [maxDurationMs, setMaxDurationMs] = useState(1800000);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [provider, setProvider] = useState<LiveProvider>("openai");
  const [geminiModel, setGeminiModel] = useState("models/gemini-2.5-flash-native-audio-preview-12-2025");
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiKeySaved, setGeminiKeySaved] = useState(false);

  useEffect(() => {
    if (settingsLoaded) return;
    const settings = getLiveVoiceSettings();
    setVoice(settings.voice);
    setLanguage(settings.language);
    setInactivityMs(settings.inactivityTimeoutMs);
    setMaxDurationMs(settings.maxSessionDurationMs);
    setProvider(settings.provider);
    setGeminiModel(settings.geminiModel);
    setSettingsLoaded(true);
    setMode(liveVoice?.mode ?? "classic");
    setAutoStart(liveVoice?.autoStart ?? false);
    secureStorage.get(STORAGE_KEY_REALTIME_KEY).then((val) => {
      if (val) setApiKey(val);
    });
    secureStorage.get(STORAGE_KEY_GEMINI_KEY).then((val) => {
      if (val) setGeminiKey(val);
    });
  }, [settingsLoaded, liveVoice]);

  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    setApiKeySaved(false);
  };

  const handleApiKeyBlur = async () => {
    await secureStorage.set(STORAGE_KEY_REALTIME_KEY, apiKey.trim());
    setApiKeySaved(true);
  };

  const handleProviderChange = (p: string) => {
    setProvider(p as LiveProvider);
    updateLiveVoiceProvider(p as LiveProvider);
  };

  const handleGeminiModelChange = (val: string) => {
    setGeminiModel(val);
    updateGeminiModel(val.trim());
  };

  const handleGeminiKeyChange = (val: string) => {
    setGeminiKey(val);
    setGeminiKeySaved(false);
  };

  const handleGeminiKeyBlur = async () => {
    await secureStorage.set(STORAGE_KEY_GEMINI_KEY, geminiKey.trim());
    setGeminiKeySaved(true);
  };

  const handleModeChange = (newMode: VoiceMode) => {
    setMode(newMode);
    toggleLiveVoiceMode(newMode);
    updateLiveVoiceMode(newMode);
  };

  const handleAutoStartChange = (checked: boolean) => {
    setAutoStart(checked);
    toggleLiveVoiceAutoStart(checked);
    updateLiveVoiceAutoStart(checked);
  };

  const handleVoiceChange = (v: string) => {
    setVoice(v);
    updateLiveVoiceVoice(v);
  };

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    updateLiveVoiceLanguage(lang);
  };

  const handleInactivityChange = (val: string) => {
    const ms = Number(val);
    setInactivityMs(ms);
    updateInactivityTimeout(ms);
  };

  const handleMaxDurationChange = (val: string) => {
    const ms = Number(val);
    setMaxDurationMs(ms);
    updateMaxSessionDuration(ms);
  };

  const voiceOptions = LIVE_VOICE_OPTIONS.voices.map((v) => ({
    label: v.name,
    value: v.id,
  }));

  const languageOptions = LIVE_VOICE_OPTIONS.languages.map((l) => ({
    label: l.name,
    value: l.id,
  }));

  const inactivityOptions = LIVE_VOICE_OPTIONS.inactivityOptions.map((o) => ({
    label: o.name,
    value: String(o.id),
  }));

  const maxDurationOptions = LIVE_VOICE_OPTIONS.maxDurationOptions.map((o) => ({
    label: o.name,
    value: String(o.id),
  }));

  const isLive = mode === "live";

  return (
    <div className="space-y-4">
      <Header
        title="Live Voice"
        description="Configure OpenAI Realtime voice mode for low-latency speech interaction"
        isMainTitle
      />

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">Voice Mode</Label>
          <p className="text-xs text-muted-foreground mt-1">
            {isLive
              ? "Live Voice is active. Uses a persistent Realtime audio session."
              : "Classic Voice is active. Uses VAD -> STT -> LLM -> TTS pipeline."}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="radio"
              name="voiceMode"
              checked={mode === "classic"}
              onChange={() => handleModeChange("classic")}
            />
            Classic
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="radio"
              name="voiceMode"
              checked={mode === "live"}
              onChange={() => handleModeChange("live")}
            />
            Live
          </label>
        </div>
      </div>

      {isLive && (
        <div className="space-y-3 border border-border/20 rounded-lg p-4 bg-muted/10">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Provider</Label>
            <p className="text-xs text-muted-foreground">
              Realtime backend for Live Voice.
            </p>
            <div className="max-w-xs">
              <Selection
                selected={provider}
                onChange={handleProviderChange}
                options={LIVE_VOICE_OPTIONS.providers.map((p) => ({
                  label: p.name,
                  value: p.id,
                }))}
                placeholder="Select a provider"
              />
            </div>
          </div>

          {provider === "openai" && (
            <div className="space-y-1">
              <Label className="text-sm font-medium">OpenAI Realtime API key</Label>
              <p className="text-xs text-muted-foreground">
                Stored securely on this device. Required to start Live Voice
                (each device needs its own key — it does not sync).
              </p>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                onBlur={handleApiKeyBlur}
                placeholder="sk-..."
                className="w-full max-w-md text-xs px-2 py-1.5 rounded border border-border/30 bg-background font-mono"
              />
              {apiKeySaved && <p className="text-xs text-green-500">Saved.</p>}
            </div>
          )}

          {provider === "gemini" && (
            <>
              <div className="space-y-1">
                <Label className="text-sm font-medium">Gemini API key</Label>
                <p className="text-xs text-muted-foreground">
                  Google AI Studio key. Stored securely on this device.
                </p>
                <input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => handleGeminiKeyChange(e.target.value)}
                  onBlur={handleGeminiKeyBlur}
                  placeholder="AIza..."
                  className="w-full max-w-md text-xs px-2 py-1.5 rounded border border-border/30 bg-background font-mono"
                />
                {geminiKeySaved && <p className="text-xs text-green-500">Saved.</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium">Gemini Live model</Label>
                <p className="text-xs text-muted-foreground">
                  e.g. models/gemini-2.5-flash-native-audio-preview-12-2025
                </p>
                <input
                  type="text"
                  value={geminiModel}
                  onChange={(e) => handleGeminiModelChange(e.target.value)}
                  placeholder="models/gemini-2.5-flash-native-audio-preview-12-2025"
                  className="w-full max-w-md text-xs px-2 py-1.5 rounded border border-border/30 bg-background font-mono"
                />
              </div>
            </>
          )}

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Auto-start on launch</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Automatically start Live Voice session when the app opens
              </p>
            </div>
            <Switch
              checked={autoStart}
              onCheckedChange={handleAutoStartChange}
              aria-label="Toggle auto-start"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Voice</Label>
            <div className="max-w-xs">
              <Selection
                selected={voice}
                onChange={handleVoiceChange}
                options={voiceOptions}
                placeholder="Select a voice"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Language</Label>
            <p className="text-xs text-muted-foreground">
              Language preference for Live Voice responses
            </p>
            <div className="max-w-xs">
              <Selection
                selected={language}
                onChange={handleLanguageChange}
                options={languageOptions}
                placeholder="Select a language"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Inactivity Timeout</Label>
            <p className="text-xs text-muted-foreground">
              Auto-stop after no activity for this duration
            </p>
            <div className="max-w-xs">
              <Selection
                selected={String(inactivityMs)}
                onChange={handleInactivityChange}
                options={inactivityOptions}
                placeholder="Select timeout"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Max Session Duration</Label>
            <p className="text-xs text-muted-foreground">
              Automatically end session after this time
            </p>
            <div className="max-w-xs">
              <Selection
                selected={String(maxDurationMs)}
                onChange={handleMaxDurationChange}
                options={maxDurationOptions}
                placeholder="Select max duration"
              />
            </div>
          </div>

          <div className="text-xs text-muted-foreground border-t border-border/10 pt-3 mt-2">
            <p className="font-medium mb-1">Estimated Cost</p>
            <p>~$0.02/min of user speech + ~$0.08/min of assistant speech (gpt-realtime-2.1)</p>
            <p>A typical 10-minute session: ~$0.48</p>
          </div>
        </div>
      )}
    </div>
  );
};
