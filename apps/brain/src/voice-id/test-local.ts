/**
 * One-shot validation of the voice-id end-to-end pipeline.
 *
 * Generates two synthetic WAVs (different frequencies → different "speakers"),
 * loads the WavLM model, extracts embeddings, confirms dims == 512
 * (SV head, not hidden states), enrolls one, and verifies both.
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

function generateSineWav(freqHz: number): string {
  const numSamples = SAMPLE_RATE * DURATION_SEC;
  const pcm = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    pcm[i] = Math.sin((2 * Math.PI * freqHz * i) / SAMPLE_RATE) * 0.5;
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
  const wavA = generateSineWav(440);
  const wavB = generateSineWav(880);

  const pcmA = decodeBase64Wav(wavA);
  const pcmB = decodeBase64Wav(wavB);

  console.log("[test] Loading WavLM model…");
  const start = Date.now();
  const embA = await embed(pcmA);
  console.log(`[test] Embed A computed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  const embB = await embed(pcmB);

  console.log(`\n── Embedding dimensions ────────────────`);
  console.log(`  dims: ${embA.length}`);

  if (embA.length !== 512) {
    console.log(`  ❌ FAIL: expected 512 (SV head), got ${embA.length}`);
    if (embA.length === 768) {
      console.log(`     Got 768 — model returned hidden states.`);
      console.log(`     Need to use meanPool on last_hidden_state instead.`);
    }
    process.exit(1);
  }
  console.log(`  ✅ dims = 512 (SV head confirmed)`);

  console.log(`\n── Speaker discrimination ──────────────`);
  const sameScore = cosineSim(embA, embA);
  const diffScore = cosineSim(embA, embB);
  const gap = sameScore - diffScore;

  console.log(`  same-voice score (A vs A): ${sameScore.toFixed(4)}`);
  console.log(`  diff-voice score (A vs B): ${diffScore.toFixed(4)}`);
  console.log(`  gap:                      ${gap.toFixed(4)}`);

  const sameOk = sameScore >= 0.85;
  const gapOk = gap >= 0.1;
  if (!sameOk) console.log(`  ⚠️  same-voice score surprisingly low`);
  if (!gapOk) console.log(`  ⚠️  gap very narrow`);
  console.log(`  ✅ discrimination gap: ${gapOk ? "good" : "narrow"}`);

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

  const count1 = await store.addSample(Array.from(embA));
  console.log(`  enroll WAV A: ${count1} sample(s)`);

  const vpA = await store.getVoiceprint();
  const storedVec = JSON.parse(vpA!.embedding) as number[];
  const verifySameScore = cosineSim(embA, storedVec);
  const verifyDiffScore = cosineSim(embB, storedVec);
  console.log(`  verify WAV A (same):     ${verifySameScore.toFixed(4)}`);
  console.log(`  verify WAV B (diff):     ${verifyDiffScore.toFixed(4)}`);

  const rawRow = await db.execute("SELECT embedding FROM voiceprints WHERE id = 'primary'");
  const rawEmbedding = rawRow.rows[0].embedding as string;
  const isEncrypted = rawEmbedding.startsWith("enc:v1:");
  console.log(`  encrypted at rest: ${isEncrypted ? "✅" : "❌"}`);

  console.log(`\n── Summary ──────────────────────────────`);
  const passed = embA.length === 512 && sameScore >= 0.99 && verifyDiffScore < verifySameScore && isEncrypted;
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
