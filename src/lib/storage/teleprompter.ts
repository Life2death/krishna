import { STORAGE_KEYS } from "@/config";

export function getTeleprompterEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEYS.TELEPROMPTER_ENABLED) === "true";
}

export function setTeleprompterEnabled(enabled: boolean): void {
  localStorage.setItem(
    STORAGE_KEYS.TELEPROMPTER_ENABLED,
    enabled ? "true" : "false"
  );
}

export function getTeleprompterFontSize(): number {
  const v = localStorage.getItem(STORAGE_KEYS.TELEPROMPTER_FONT_SIZE);
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n >= 10 && n <= 36 ? n : 13;
}

export function setTeleprompterFontSize(size: number): void {
  localStorage.setItem(
    STORAGE_KEYS.TELEPROMPTER_FONT_SIZE,
    String(Math.max(10, Math.min(36, Math.round(size))))
  );
}

export function getTeleprompterOpacity(): number {
  const v = localStorage.getItem(STORAGE_KEYS.TELEPROMPTER_OPACITY);
  const n = v ? parseFloat(v) : NaN;
  return Number.isFinite(n) && n >= 0.3 && n <= 1.0 ? n : 0.92;
}

export function setTeleprompterOpacity(opacity: number): void {
  localStorage.setItem(
    STORAGE_KEYS.TELEPROMPTER_OPACITY,
    String(Math.max(0.3, Math.min(1.0, opacity)))
  );
}
