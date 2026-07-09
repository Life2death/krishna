import { STORAGE_KEYS } from "@/config";

export type CursorType = "invisible" | "default" | "auto";

export interface CustomizableState {
  appIcon: {
    isVisible: boolean;
  };
  alwaysOnTop: {
    isEnabled: boolean;
  };
  autostart: {
    isEnabled: boolean;
  };
  cursor: {
    type: CursorType;
  };
  computerControl: {
    enabled: boolean;
  };
  liveVoice: {
    enabled: boolean;
    mode: "classic" | "live";
    autoStart: boolean;
  };
}

// Desktop defaults to Live Voice (with classic as the fallback); mobile stays on
// classic until on-device Live Voice is verified.
const IS_MOBILE_UA =
  typeof navigator !== "undefined" &&
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export const DEFAULT_CUSTOMIZABLE_STATE: CustomizableState = {
  appIcon: { isVisible: true },
  alwaysOnTop: { isEnabled: false },
  autostart: { isEnabled: true },
  cursor: { type: "invisible" },
  computerControl: { enabled: false },
  liveVoice: {
    enabled: !IS_MOBILE_UA,
    mode: IS_MOBILE_UA ? "classic" : "live",
    autoStart: false,
  },
};

/**
 * Get customizable state from localStorage
 */
export const getCustomizableState = (): CustomizableState => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.CUSTOMIZABLE);
    if (!stored) {
      return DEFAULT_CUSTOMIZABLE_STATE;
    }

    const parsedState = JSON.parse(stored);

    return {
      appIcon: parsedState.appIcon || DEFAULT_CUSTOMIZABLE_STATE.appIcon,
      alwaysOnTop:
        parsedState.alwaysOnTop || DEFAULT_CUSTOMIZABLE_STATE.alwaysOnTop,
      autostart: parsedState.autostart || DEFAULT_CUSTOMIZABLE_STATE.autostart,
      cursor: parsedState.cursor || DEFAULT_CUSTOMIZABLE_STATE.cursor,
      computerControl:
        parsedState.computerControl || DEFAULT_CUSTOMIZABLE_STATE.computerControl,
      liveVoice: {
        enabled: parsedState.liveVoice?.enabled ?? DEFAULT_CUSTOMIZABLE_STATE.liveVoice.enabled,
        mode: parsedState.liveVoice?.mode ?? DEFAULT_CUSTOMIZABLE_STATE.liveVoice.mode,
        autoStart: parsedState.liveVoice?.autoStart ?? DEFAULT_CUSTOMIZABLE_STATE.liveVoice.autoStart,
      },
    };
  } catch (error) {
    console.error("Failed to get customizable state:", error);
    return DEFAULT_CUSTOMIZABLE_STATE;
  }
};

/**
 * Save customizable state to localStorage
 */
export const setCustomizableState = (state: CustomizableState): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.CUSTOMIZABLE, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save customizable state:", error);
  }
};

/**
 * Update app icon visibility
 */
export const updateAppIconVisibility = (
  isVisible: boolean
): CustomizableState => {
  const currentState = getCustomizableState();
  const newState = { ...currentState, appIcon: { isVisible } };
  setCustomizableState(newState);
  return newState;
};

/**
 * Update always on top state
 */
export const updateAlwaysOnTop = (isEnabled: boolean): CustomizableState => {
  const currentState = getCustomizableState();
  const newState = { ...currentState, alwaysOnTop: { isEnabled } };
  setCustomizableState(newState);
  return newState;
};

/**
 * Update cursor type
 */
export const updateCursorType = (type: CursorType): CustomizableState => {
  const currentState = getCustomizableState();
  const newState = { ...currentState, cursor: { type } };
  setCustomizableState(newState);
  return newState;
};

/**
 * Update autostart state
 */
export const updateAutostart = (isEnabled: boolean): CustomizableState => {
  const currentState = getCustomizableState();
  const newState = { ...currentState, autostart: { isEnabled } };
  setCustomizableState(newState);
  return newState;
};

export const updateComputerControl = (enabled: boolean): CustomizableState => {
  const currentState = getCustomizableState();
  const newState = { ...currentState, computerControl: { enabled } };
  setCustomizableState(newState);
  return newState;
};

export const updateLiveVoice = (enabled: boolean): CustomizableState => {
  const currentState = getCustomizableState();
  const newState = { ...currentState, liveVoice: { ...currentState.liveVoice, enabled } };
  setCustomizableState(newState);
  return newState;
};

export const updateLiveVoiceMode = (mode: "classic" | "live"): CustomizableState => {
  const currentState = getCustomizableState();
  const newState = {
    ...currentState,
    liveVoice: {
      ...currentState.liveVoice,
      enabled: mode === "live",
      mode,
    },
  };
  setCustomizableState(newState);
  return newState;
};

export const updateLiveVoiceAutoStart = (autoStart: boolean): CustomizableState => {
  const currentState = getCustomizableState();
  const newState = { ...currentState, liveVoice: { ...currentState.liveVoice, autoStart } };
  setCustomizableState(newState);
  return newState;
};
