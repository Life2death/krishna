export interface BrainConfig {
  brainMode: "local" | "remote";
  brainUrl: string;
  brainToken: string;
  voiceIdEnabled?: boolean;
  voiceThreshold?: number;
}

export type PushOp = "create" | "save" | "delete" | "deleteAll" | "append";

const STORAGE_KEY = "krishna_brain_config";

function isMobilePlatform(): boolean {
  try {
    // Tauri mobile exposes a different __TAURI__ internals check
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent || "";
      if (/android|iphone|ipad|ipod/i.test(ua)) return true;
    }
    // Check Tauri platform API (mobile = not macos/windows/linux)
    if (typeof window !== "undefined" && (window as any).__TAURI__) {
      try {
        const { type } = (window as any).__TAURI__.os?.platform() || {};
        if (type === "android" || type === "ios") return true;
      } catch {}
    }
  } catch {}
  return false;
}

const DEFAULT_MODE: "local" | "remote" = isMobilePlatform() ? "remote" : "local";

export function readBrainConfig(): BrainConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const mode =
        parsed.brainMode === "local" || parsed.brainMode === "remote"
          ? parsed.brainMode
          : DEFAULT_MODE;
      return {
        brainMode: mode,
        brainUrl: parsed.brainUrl || "http://localhost:8787",
        brainToken: parsed.brainToken || "",
        voiceIdEnabled: parsed.voiceIdEnabled ?? false,
        voiceThreshold: parsed.voiceThreshold ?? 0.85,
      };
    }
  } catch {}
  return { brainMode: DEFAULT_MODE, brainUrl: "http://localhost:8787", brainToken: "", voiceIdEnabled: false, voiceThreshold: 0.85 };
}

export function saveBrainConfig(config: BrainConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export class RemoteError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "RemoteError";
  }
}

function buildUrl(base: string, path: string): string {
  const baseClean = base.replace(/\/+$/, "");
  return `${baseClean}${path}`;
}

function buildHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function remoteGet<T>(path: string, config: BrainConfig): Promise<T> {
  const res = await fetch(buildUrl(config.brainUrl, path), {
    headers: buildHeaders(config.brainToken),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new RemoteError(res.status, `GET ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function remotePost<T>(path: string, body: unknown, config: BrainConfig): Promise<T> {
  const res = await fetch(buildUrl(config.brainUrl, path), {
    method: "POST",
    headers: buildHeaders(config.brainToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new RemoteError(res.status, `POST ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function remotePut<T>(path: string, body: unknown, config: BrainConfig): Promise<T> {
  const res = await fetch(buildUrl(config.brainUrl, path), {
    method: "PUT",
    headers: buildHeaders(config.brainToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new RemoteError(res.status, `PUT ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function remoteDelete<T>(path: string, config: BrainConfig): Promise<T> {
  const res = await fetch(buildUrl(config.brainUrl, path), {
    method: "DELETE",
    headers: buildHeaders(config.brainToken),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new RemoteError(res.status, `DELETE ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function remoteHealth(config: BrainConfig): Promise<boolean> {
  try {
    const res = await fetch(buildUrl(config.brainUrl, "/health"), {
      headers: buildHeaders(config.brainToken),
    });
    return res.ok;
  } catch {
    return false;
  }
}
