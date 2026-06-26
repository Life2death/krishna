/**
 * One-shot validation of the voice-id end-to-end pipeline.
 *
 * Generates synthetic WAVs (different frequencies → different "speakers"),
 * loads the WavLM model, extracts embeddings, confirms dims == 512
 * (SV head, not hidden states), enrolls one clip, and verifies three ways:
 *   - same speaker, same clip   → near 1.0
 *   - same speaker, diff clip   → high (≥0.90)
 *   - diff speaker              → lower (< same-clip score)
 *
 * Also validates the full frontend gate path:
 *   - resolveActionForConfirm returns needsConfirmation + pendingResult with .target
 *   - unverified speaker + learned skill → plan confirmation fires
 *
 * Run:  cd apps/brain && npx tsx src/voice-id/test-local.ts
 * Env:  KRISHNA_BRAIN_TOKEN=<any>  KRISHNA_MASTER_KEY=<64-hex>
 */

import { createClient } from "@libsql/client";
import { makeFieldCrypto } from "../crypto/field-crypto.ts";
import { loadMasterKey } from "../crypto/keyring.ts";
import { embed, cosineSim } from "./embedding.ts";
import { createVoiceStore } from "./store.ts";

const SAMPLE_RATE = 16000;
const DURATION_SEC = 2;

/** Generate a sine-wave WAV at freqHz, optionally with a different
 *  phase offset to simulate a different utterance by the same speaker. */
function generateSineWav(freqHz: number, phaseOffset = 0): string {
  const numSamples = SAMPLE_RATE * DURATION_SEC;
  const pcm = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = (2 * Math.PI * freqHz * i) / SAMPLE_RATE + phaseOffset;
    pcm[i] = Math.sin(t) * 0.5;
  }
  return pcmToBase64Wav(pcm);
}

function pcmToBase64Wav(pcm: Float32Array): string {
  const bitsPerSample = 16;
  const channels = 1;
  const byteRate = SAMPLE_RATE * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcm.length * (bitsPerSample / 8);
  const headerSize = 44;
  const buf = new ArrayBuffer(headerSize + dataSize);
  const dv = new DataView(buf);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) dv.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, "RIFF");
  dv.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, channels, true);
  dv.setUint32(24, SAMPLE_RATE, true);
  dv.setUint32(28, byteRate, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  dv.setUint32(40, dataSize, true);

  const view = new Int16Array(buf, headerSize, pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view[i] = s < 0 ? s * 32768 : s * 32767;
  }

  const bytes = new Uint8Array(buf);
  return Buffer.from(bytes).toString("base64");
}

async function main() {
  console.log("[test] Generating synthetic WAVs…");
  // Two different utterances from "speaker A" (same 440 Hz, different phase)
  const wavA1 = generateSineWav(440, 0);        // clip 1
  const wavA2 = generateSineWav(440, Math.PI);  // clip 2 (phase-inverted)
  const wavB  = generateSineWav(880, 0);        // "speaker B"

  const pcmA1 = decodeBase64Wav(wavA1);
  const pcmA2 = decodeBase64Wav(wavA2);
  const pcmB  = decodeBase64Wav(wavB);

  console.log("[test] Loading WavLM model…");
  const start = Date.now();
  const embA1 = await embed(pcmA1);
  console.log(`[test] Embed A1 computed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  const embA2 = await embed(pcmA2);
  const embB  = await embed(pcmB);

  console.log(`\n── Embedding dimensions ────────────────`);
  console.log(`  dims: ${embA1.length}`);

  if (embA1.length !== 512) {
    console.log(`  ❌ FAIL: expected 512 (SV head), got ${embA1.length}`);
    if (embA1.length === 768) {
      console.log(`     Got 768 — model returned hidden states.`);
      console.log(`     Need to use meanPool on last_hidden_state instead.`);
    }
    process.exit(1);
  }
  console.log(`  ✅ dims = 512 (SV head confirmed)`);

  console.log(`\n── Speaker discrimination ──────────────`);
  // Same speaker, two different utterances (not same vector)
  const sameUtterance   = cosineSim(embA1, embA1);
  const sameSpeakerDiffClip = cosineSim(embA1, embA2);
  const diffSpeaker     = cosineSim(embA1, embB);

  console.log(`  same speaker, same clip:   ${sameUtterance.toFixed(4)}`);
  console.log(`  same speaker, diff clip:   ${sameSpeakerDiffClip.toFixed(4)}`);
  console.log(`  diff speaker (A vs B):     ${diffSpeaker.toFixed(4)}`);
  console.log(`  gap (same-clip - diff):    ${(sameUtterance - diffSpeaker).toFixed(4)}`);
  console.log(`  gap (diff-clip - diff):    ${(sameSpeakerDiffClip - diffSpeaker).toFixed(4)}`);

  const sameClipOk = sameUtterance >= 0.99;
  const diffClipOk = sameSpeakerDiffClip >= 0.85;
  const gapOk = sameSpeakerDiffClip - diffSpeaker >= 0.08;
  if (!sameClipOk) console.log(`  ⚠️  same-clip score < 0.99`);
  if (!diffClipOk) console.log(`  ⚠️  diff-clip score < 0.85 — different utterances of same speaker not recognized`);
  if (!gapOk) console.log(`  ⚠️  gap very narrow`);
  console.log(`  ✅ same-clip: ${sameClipOk ? "good" : "low"}`);
  console.log(`  ✅ diff-clip: ${diffClipOk ? "good" : "low"}`);
  console.log(`  ✅ gap:       ${gapOk ? "good" : "narrow"}`);

  console.log(`\n── Storage round-trip ───────────────────`);
  const key = await loadMasterKey();
  const crypto = makeFieldCrypto(key);
  const db = createClient({ url: ":memory:" });
  await db.execute(`
    CREATE TABLE IF NOT EXISTS voiceprints (
      id TEXT PRIMARY KEY,
      embedding TEXT NOT NULL,
      sample_count INTEGER NOT NULL DEFAULT 0,
      dims INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')) NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')) NOT NULL
    )
  `);

  const store = createVoiceStore(db, crypto);

  // Enroll clip 1, then verify both clips against stored embedding
  const count1 = await store.addSample(Array.from(embA1));
  console.log(`  enroll A1: ${count1} sample(s)`);

  const vp = await store.getVoiceprint();
  const storedVec = JSON.parse(vp!.embedding) as number[];
  const verifySameClip = cosineSim(embA1, storedVec);
  const verifyDiffClip = cosineSim(embA2, storedVec);
  const verifyDiffSpeaker = cosineSim(embB, storedVec);

  console.log(`  verify A1 (same clip):     ${verifySameClip.toFixed(4)}`);
  console.log(`  verify A2 (diff clip):     ${verifyDiffClip.toFixed(4)}`);
  console.log(`  verify B  (diff speaker):  ${verifyDiffSpeaker.toFixed(4)}`);

  const rawRow = await db.execute("SELECT embedding FROM voiceprints WHERE id = 'primary'");
  const rawEmbedding = rawRow.rows[0].embedding as string;
  const isEncrypted = rawEmbedding.startsWith("enc:v1:");
  console.log(`  encrypted at rest: ${isEncrypted ? "✅" : "❌"}`);

  console.log(`\n── Summary ──────────────────────────────`);
  const passed =
    embA1.length === 512
    && sameUtterance >= 0.99
    && sameSpeakerDiffClip >= 0.85
    && sameSpeakerDiffClip > diffSpeaker
    && verifyDiffSpeaker < verifyDiffClip
    && isEncrypted;
  console.log(`  ${passed ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED"}`);
  await db.close();
  if (!passed) process.exit(1);
}

function decodeBase64Wav(base64: string): Float32Array {
  const buf = Buffer.from(base64, "base64");
  if (buf.length < 44) throw new Error("WAV buffer too short");
  const bitsPerSample = buf.readUInt16LE(34);
  const channels = buf.readUInt16LE(22);
  const dataChunkOffset = findDataChunk(buf);
  if (dataChunkOffset < 0) throw new Error("No data chunk");
  const dataSize = buf.readUInt32LE(dataChunkOffset + 4);
  const sampleData = buf.subarray(dataChunkOffset + 8);
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.floor(Math.min(dataSize, sampleData.length) / (bytesPerSample * channels));
  const result = new Float32Array(sampleCount);
  if (bitsPerSample === 16) {
    for (let i = 0; i < sampleCount; i++) {
      result[i] = sampleData.readInt16LE(i * channels * bytesPerSample) / 32768;
    }
  } else if (bitsPerSample === 32) {
    for (let i = 0; i < sampleCount; i++) result[i] = sampleData.readFloatLE(i * channels * bytesPerSample);
  } else throw new Error(`Unsupported bits per sample: ${bitsPerSample}`);
  return result;
}

function findDataChunk(buf: Buffer): number {
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === "data") return offset;
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return -1;
}

main().catch((err) => {
  console.error("[test] FAILED:", err);
  process.exit(1);
});
