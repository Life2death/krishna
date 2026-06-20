export interface BrainConfig {
  brainMode: "local" | "remote";
  brainUrl: string;
  brainToken: string;
}

export type PushOp = "create" | "save" | "delete" | "deleteAll" | "append";

const STORAGE_KEY = "krishna_brain_config";

export function readBrainConfig(): BrainConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        brainMode: parsed.brainMode === "remote" ? "remote" : "local",
        brainUrl: parsed.brainUrl || "http://localhost:8787",
        brainToken: parsed.brainToken || "",
      };
    }
  } catch {}
  return { brainMode: "local", brainUrl: "http://localhost:8787", brainToken: "" };
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
