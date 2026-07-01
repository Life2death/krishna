import { readBrainConfig } from "./brain-config";
import { embed, cosineSim, l2Normalize } from "./voice-id/embedding";
import { encryptVoiceprint, decryptVoiceprint } from "./voice-crypto";
import {
  getAllSamples,
  addSample,
  deleteAllSamples,
  getSampleCount,
  evictSample,
} from "@krishna/core/database";
import {
  getState,
  upsertState,
  resetState,
} from "@krishna/core/database";

export interface VoiceVerifyResult {
  match: boolean;
  score: number;
  threshold: number;
  enrolled: boolean;
  mature: boolean;
  sampleCount: number;
}

export interface VoiceStatus {
  enrolled: boolean;
  sampleCount: number;
  dims: number;
  threshold: number;
  mature: boolean;
  adaptiveThreshold: number | null;
  thresholdConfidence: number | null;
}

export interface VoiceEnrollResult {
  sampleCount: number;
  dims: number;
}

const DEFAULT_K = 5;

export function topKMean(scores: number[], k: number): number {
  if (scores.length === 0) return 0;
  const sorted = [...scores].sort((a, b) => b - a);
  const top = sorted.slice(0, Math.min(k, sorted.length));
  return top.reduce((sum, v) => sum + v, 0) / top.length;
}

export function computeAdaptiveThreshold(selfScores: number[], staticThreshold: number = 0.85): { threshold: number; confidence: number } {
  if (selfScores.length === 0) {
    return { threshold: staticThreshold, confidence: 0 };
  }

  const selfMean = selfScores.reduce((s, v) => s + v, 0) / selfScores.length;
  const selfStd = Math.sqrt(selfScores.reduce((s, v) => s + (v - selfMean) ** 2, 0) / selfScores.length);

  const k = 2;
  const threshold = Math.max(staticThreshold, selfMean - k * selfStd);

  const n = selfScores.length;
  const confidence = Math.min(1, n / 24);

  return { threshold, confidence };
}

export function evaluateMaturity(sampleCount: number, confidence: number): boolean {
  return sampleCount >= 12 && confidence >= 0.5;
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
  k: number = DEFAULT_K,
): Promise<VoiceVerifyResult> {
  const samples = await getAllSamples();
  if (samples.length === 0) {
    return { match: true, score: 0, threshold, enrolled: false, mature: false, sampleCount: 0 };
  }

  const vec = await embed(pcm, sampleRate);
  const state = await getState();
  const effectiveThreshold = state?.adaptive_threshold ?? threshold;

  const scores: number[] = [];
  for (const s of samples) {
    const decrypted = await decryptVoiceprint(s.embedding);
    if (!decrypted) continue;
    const storedVec = JSON.parse(decrypted) as number[];
    scores.push(cosineSim(vec, storedVec));
  }

  if (scores.length === 0) {
    return { match: true, score: 0, threshold, enrolled: true, mature: false, sampleCount: samples.length };
  }

  const score = topKMean(scores, k);
  const mature = state ? state.mature === 1 : false;

  return {
    match: score >= effectiveThreshold,
    score,
    threshold: effectiveThreshold,
    enrolled: true,
    mature,
    sampleCount: samples.length,
  };
}

export async function enrollVoice(
  pcm: Float32Array,
  sampleRate: number,
): Promise<VoiceEnrollResult> {
  const vec = await embed(pcm, sampleRate);
  const normalized = Array.from(l2Normalize(vec));
  const encrypted = await encryptVoiceprint(JSON.stringify(normalized));

  const id = crypto.randomUUID();
  await addSample(id, 'primary', encrypted, normalized.length);

  const count = await getSampleCount();
  const state = await getState();

  const selfScores: number[] = [];
  const allSamples = await getAllSamples();
  for (const s of allSamples) {
    if (s.id === id) continue;
    const decrypted = await decryptVoiceprint(s.embedding);
    if (!decrypted) continue;
    const storedVec = JSON.parse(decrypted) as number[];
    selfScores.push(cosineSim(normalized, storedVec));
  }

  const { threshold, confidence } = computeAdaptiveThreshold(selfScores, readVoiceThreshold());
  const mature = evaluateMaturity(count, confidence) ? 1 : 0;

  await upsertState('primary', {
    sample_count: count,
    mature,
    adaptive_threshold: threshold,
    threshold_confidence: confidence,
  });

  // If over cap, evict nearest duplicate (most similar to the new sample)
  if (count > 30) {
    let worstId: string | null = null;
    let worstScore = -Infinity;
    for (const s of allSamples) {
      if (s.id === id) continue;
      const decrypted = await decryptVoiceprint(s.embedding);
      if (!decrypted) continue;
      const storedVec = JSON.parse(decrypted) as number[];
      const sim = cosineSim(normalized, storedVec);
      if (sim > worstScore) {
        worstScore = sim;
        worstId = s.id;
      }
    }
    if (worstId) {
      await evictSample(worstId);
    }
  }

  return { sampleCount: count, dims: normalized.length };
}

export async function considerAddSample(
  pcm: Float32Array,
  sampleRate: number,
  verifyResult: VoiceVerifyResult,
): Promise<boolean> {
  if (!verifyResult.enrolled || !verifyResult.match) return false;
  if (verifyResult.score < 0.88) return false;

  const state = await getState();
  if (!state) return false;

  const vec = await embed(pcm, sampleRate);
  const normalized = Array.from(l2Normalize(vec));
  const encrypted = await encryptVoiceprint(JSON.stringify(normalized));

  const id = crypto.randomUUID();
  await addSample(id, 'primary', encrypted, normalized.length);

  const count = await getSampleCount();

  const selfScores: number[] = [];
  const allSamples = await getAllSamples();
  for (const s of allSamples) {
    if (s.id === id) continue;
    const decrypted = await decryptVoiceprint(s.embedding);
    if (!decrypted) continue;
    const storedVec = JSON.parse(decrypted) as number[];
    selfScores.push(cosineSim(normalized, storedVec));
  }

  const { threshold, confidence } = computeAdaptiveThreshold(selfScores, readVoiceThreshold());
  const mature = evaluateMaturity(count, confidence) ? 1 : 0;

  await upsertState('primary', {
    sample_count: count,
    mature,
    adaptive_threshold: threshold,
    threshold_confidence: confidence,
  });

  return true;
}

export async function getVoiceStatus(): Promise<VoiceStatus> {
  const samples = await getAllSamples();
  const state = await getState();
  return {
    enrolled: samples.length > 0,
    sampleCount: samples.length,
    dims: samples.length > 0 ? samples[0].dims : 0,
    threshold: state?.adaptive_threshold ?? readVoiceThreshold(),
    mature: state ? state.mature === 1 : false,
    adaptiveThreshold: state?.adaptive_threshold ?? null,
    thresholdConfidence: state?.threshold_confidence ?? null,
  };
}

export async function resetEnrollment(): Promise<void> {
  await deleteAllSamples();
  await resetState();
}
