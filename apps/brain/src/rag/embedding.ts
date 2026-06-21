/**
 * Local embedding generator using @xenova/transformers.
 * All-MiniLM-L6-v2: 384-dim vectors, fast CPU inference, no API key needed.
 */

type PipelineFunction = (texts: string[]) => Promise<number[][]>;

let pipelineFn: PipelineFunction | null = null;

async function getPipeline(): Promise<PipelineFunction> {
  if (pipelineFn) return pipelineFn;

  try {
    const { pipeline } = await import("@xenova/transformers");
    const extractor = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
    pipelineFn = async (texts: string[]) => {
      const result = await extractor(texts, { pooling: "mean", normalize: true });
      return result.tolist() as number[][];
    };
    console.log("[rag] Embedding pipeline loaded (all-MiniLM-L6-v2, 384d)");
    return pipelineFn;
  } catch (err) {
    console.error("[rag] Failed to load embedding pipeline:", err);
    throw err;
  }
}

export async function embedText(text: string): Promise<number[]> {
  const fn = await getPipeline();
  const results = await fn([text]);
  return results[0];
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const fn = await getPipeline();
  return fn(texts);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
