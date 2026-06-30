import { readBrainConfig } from "./brain-config";
import { embed, cosineSim, l2Normalize } from "./voice-id/embedding";
import { encryptVoiceprint, decryptVoiceprint } from "./voice-crypto";
import {
  getVoiceprint,
  setVoiceprint,
  resetVoiceprint,
} from "@krishna/core/database/voiceprints.action";

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

export function isVoiceIdEnabled(): boolean {
  return readBrainConfig().voiceIdEnabled ?? false;
}

export function readVoiceThreshold(): number {
  return readBrainConfig().voiceThreshold ?? 0.85;
}

export async function verifyVoice(
  pcm: Float32Array,
  sampleRate: number,
  threshold: number = readVoiceThreshold(),
): Promise<VoiceVerifyResult> {
  const vp = await getVoiceprint();
  if (!vp) {
    return { match: true, score: 0, threshold, enrolled: false };
  }
  const vec = await embed(pcm, sampleRate);
  const decrypted = await decryptVoiceprint(vp.embedding);
  if (!decrypted) {
    return { match: true, score: 0, threshold, enrolled: true };
  }
  const storedVec = JSON.parse(decrypted) as number[];
  const score = cosineSim(vec, storedVec);
  return {
    match: score >= threshold,
    score,
    threshold,
    enrolled: true,
  };
}

export async function enrollVoice(
  pcm: Float32Array,
  sampleRate: number,
): Promise<VoiceEnrollResult> {
  const vec = await embed(pcm, sampleRate);
  const existing = await getVoiceprint();
  let sampleCount: number;
  let avg: number[];

  if (existing) {
    const decrypted = await decryptVoiceprint(existing.embedding);
    if (!decrypted) throw new Error("Failed to decrypt existing voiceprint");
    const currentVec = JSON.parse(decrypted) as number[];
    const n = existing.sampleCount;
    avg = currentVec.map((v, i) => ((v * n) + vec[i]) / (n + 1));
    sampleCount = n + 1;
  } else {
    avg = Array.from(vec);
    sampleCount = 1;
  }

  const normalized = Array.from(l2Normalize(avg));
  const encrypted = await encryptVoiceprint(JSON.stringify(normalized));

  let roundTripped: string;
  const decrypted = await decryptVoiceprint(encrypted);
  if (decrypted) {
    roundTripped = decrypted;
  } else {
    roundTripped = JSON.stringify(normalized);
  }
  await setVoiceprint(encrypted, sampleCount, normalized.length);

  return { sampleCount, dims: normalized.length };
}

export async function getVoiceStatus(): Promise<VoiceStatus> {
  const vp = await getVoiceprint();
  return {
    enrolled: vp !== null,
    sampleCount: vp?.sampleCount ?? 0,
    dims: vp?.dims ?? 0,
    threshold: readVoiceThreshold(),
  };
}

export async function resetEnrollment(): Promise<void> {
  await resetVoiceprint();
}

export async function decodeWavToPcm(wavBlob: Blob): Promise<Float32Array> {
  const arrayBuffer = await wavBlob.arrayBuffer();
  const audioCtx = new AudioContext();
  const decoded = await audioCtx.decodeAudioData(arrayBuffer);
  await audioCtx.close();
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * 16000)), 16000);
  const srcNode = offline.createBufferSource();
  srcNode.buffer = decoded;
  srcNode.connect(offline.destination);
  srcNode.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}
