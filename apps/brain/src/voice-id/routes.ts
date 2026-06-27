import type { FastifyInstance } from "fastify";
import type { BrainContext } from "../context.ts";
import { config } from "../config.ts";
import { createVoiceStore } from "./store.ts";
import { embed, cosineSim } from "./embedding.ts";

export function voiceIdRoutes(app: FastifyInstance, ctx: BrainContext): void {
  const store = createVoiceStore(ctx.db, ctx.crypto);

  app.post("/voice/enroll", async (req, reply) => {
    const { audio: base64Wav } = req.body as { audio: string };
    if (!base64Wav) {
      return reply.code(400).send({ error: "Missing audio field" });
    }
    try {
      const pcm = decodeBase64Wav(base64Wav);
      const vec = await embed(pcm);
      const sampleCount = await store.addSample(Array.from(vec));
      return { sampleCount, dims: vec.length };
    } catch (err) {
      return reply.code(400).send({
        error: "Failed to process audio",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post("/voice/verify", async (req, reply) => {
    const { audio: base64Wav, threshold: clientThreshold } = req.body as { audio: string; threshold?: number };
    if (!base64Wav) {
      return reply.code(400).send({ error: "Missing audio field" });
    }
    const effectiveThreshold = clientThreshold ?? config.voiceThreshold;
    try {
      const voiceprint = await store.getVoiceprint();
      if (!voiceprint) {
        return { match: true, score: 0, threshold: effectiveThreshold, enrolled: false };
      }
      const pcm = decodeBase64Wav(base64Wav);
      const vec = await embed(pcm);
      const storedVec = JSON.parse(voiceprint.embedding) as number[];
      const score = cosineSim(vec, storedVec);
      console.log(`[voice-id] verify: score=${score.toFixed(4)} threshold=${effectiveThreshold} match=${score >= effectiveThreshold}`);
      return {
        match: score >= effectiveThreshold,
        score,
        threshold: effectiveThreshold,
        enrolled: true,
      };
    } catch (err) {
      return reply.code(400).send({
        error: "Failed to process audio",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/voice/status", async () => {
    const vp = await store.getVoiceprint();
    return {
      enrolled: vp !== null,
      sampleCount: vp?.sampleCount ?? 0,
      dims: vp?.dims ?? 0,
      threshold: config.voiceThreshold,
    };
  });

  app.delete("/voice/enroll", async () => {
    await store.reset();
    return { ok: true };
  });
}

function decodeBase64Wav(base64: string): Float32Array {
  const buf = Buffer.from(base64, "base64");
  if (buf.length < 44) {
    throw new Error("WAV buffer too short");
  }
  const riff = buf.toString("ascii", 0, 4);
  const wave = buf.toString("ascii", 8, 12);
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Invalid WAV header — RIFF/WAVE signature missing");
  }
  const bitsPerSample = buf.readUInt16LE(34);
  const channels = buf.readUInt16LE(22);
  const dataChunkOffset = findDataChunk(buf);
  if (dataChunkOffset < 0) {
    throw new Error("No data chunk found in WAV");
  }
  const dataSize = buf.readUInt32LE(dataChunkOffset + 4);
  const sampleData = buf.subarray(dataChunkOffset + 8, dataChunkOffset + 8 + dataSize);
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.floor(sampleData.length / (bytesPerSample * channels));
  const result = new Float32Array(sampleCount);
  if (bitsPerSample === 16) {
    for (let i = 0; i < sampleCount; i++) {
      const sample = sampleData.readInt16LE(i * channels * bytesPerSample);
      result[i] = sample / 32768;
    }
  } else if (bitsPerSample === 32) {
    for (let i = 0; i < sampleCount; i++) {
      result[i] = sampleData.readFloatLE(i * channels * bytesPerSample);
    }
  } else if (bitsPerSample === 8) {
    for (let i = 0; i < sampleCount; i++) {
      result[i] = (sampleData[i * channels] - 128) / 128;
    }
  } else {
    throw new Error(`Unsupported bits per sample: ${bitsPerSample}`);
  }
  return result;
}

function findDataChunk(buf: Buffer): number {
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === "data") return offset;
    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) offset += 1;
  }
  return -1;
}
