import type { Client } from "@libsql/client";
import type { FieldCrypto } from "../crypto/field-crypto.ts";
import { l2Normalize } from "./embedding.ts";

export interface VoiceprintRow {
  id: string;
  embedding: string;
  sampleCount: number;
  dims: number;
}

export function createVoiceStore(db: Client, crypto: FieldCrypto) {
  async function getVoiceprint(): Promise<VoiceprintRow | null> {
    const result = await db.execute({
      sql: "SELECT id, embedding, sample_count, dims FROM voiceprints WHERE id = 'primary'",
      args: [],
    });
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      id: row.id as string,
      embedding: crypto.decrypt(row.embedding as string) ?? (row.embedding as string),
      sampleCount: Number(row.sample_count),
      dims: Number(row.dims),
    };
  }

  async function setVoiceprint(vec: number[], sampleCount: number): Promise<void> {
    const dims = vec.length;
    const encoded = JSON.stringify(vec);
    const encrypted = crypto.encrypt(encoded) ?? encoded;
    await db.execute({
      sql: `INSERT OR REPLACE INTO voiceprints (id, embedding, sample_count, dims, updated_at)
            VALUES ('primary', ?, ?, ?, datetime('now'))`,
      args: [encrypted, sampleCount, dims],
    });
  }

  async function addSample(vec: number[]): Promise<number> {
    const existing = await getVoiceprint();
    if (!existing) {
      await setVoiceprint(vec, 1);
      return 1;
    }
    const currentVec = JSON.parse(existing.embedding) as number[];
    const n = existing.sampleCount;
    const avg = currentVec.map((v, i) => ((v * n) + vec[i]) / (n + 1));
    const normalized = l2Normalize(avg);
    await setVoiceprint(Array.from(normalized), n + 1);
    return n + 1;
  }

  async function reset(): Promise<void> {
    await db.execute({
      sql: "DELETE FROM voiceprints WHERE id = 'primary'",
      args: [],
    });
  }

  return { getVoiceprint, setVoiceprint, addSample, reset };
}

export type VoiceStore = ReturnType<typeof createVoiceStore>;
