import { readBrainConfig } from "./remote/remote-client";

export interface VoiceVerifyResult {
  match: boolean;
  score: number;
  threshold: number;
  enrolled: boolean;
}

export interface VoiceStatus {
  enrolled: boolean;
  sampleCount: number;
  dims: number;
  threshold: number;
}

export interface VoiceEnrollResult {
  sampleCount: number;
  dims: number;
}

function getConfig() {
  const cfg = readBrainConfig();
  return { url: cfg.brainUrl, token: cfg.brainToken };
}

async function brainPost<T>(path: string, body: unknown): Promise<T> {
  const { url, token } = getConfig();
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

async function brainGet<T>(path: string): Promise<T> {
  const { url, token } = getConfig();
  const res = await fetch(`${url}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

async function brainDelete(path: string): Promise<void> {
  const { url, token } = getConfig();
  const res = await fetch(`${url}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`DELETE ${path}: ${res.status}`);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function isVoiceIdEnabled(): boolean {
  return readBrainConfig().voiceIdEnabled ?? false;
}

export function readVoiceThreshold(): number {
  return readBrainConfig().voiceThreshold ?? 0.85;
}

export async function verifyVoice(wavBlob: Blob, threshold: number = readVoiceThreshold()): Promise<VoiceVerifyResult> {
  const audio = await blobToBase64(wavBlob);
  return brainPost<VoiceVerifyResult>("/voice/verify", { audio, threshold });
}

export async function enrollVoice(wavBlob: Blob): Promise<VoiceEnrollResult> {
  const audio = await blobToBase64(wavBlob);
  return brainPost<VoiceEnrollResult>("/voice/enroll", { audio });
}

export async function getVoiceStatus(): Promise<VoiceStatus> {
  return brainGet<VoiceStatus>("/voice/status");
}

export async function resetEnrollment(): Promise<void> {
  await brainDelete("/voice/enroll");
}
