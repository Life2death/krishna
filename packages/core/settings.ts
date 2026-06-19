export interface ResponseSettings {
  responseLength: string;
  language: string;
  autoScroll: boolean;
}

export type SettingsGetter = () => ResponseSettings;

let _settingsGetter: SettingsGetter | null = null;

export const setSettingsGetter = (fn: SettingsGetter) => {
  _settingsGetter = fn;
};

export const getResponseSettings = () => {
  if (!_settingsGetter) throw new Error("Settings getter not set - call setSettingsGetter() before first use");
  return _settingsGetter();
};

export { RESPONSE_LENGTHS, LANGUAGES } from "./response-settings.constants";
