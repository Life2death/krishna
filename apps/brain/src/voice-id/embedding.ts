type ModelSingleton = {
  processor: any;
  model: any;
};

let modelSingleton: ModelSingleton | null = null;

async function getModel(): Promise<ModelSingleton> {
  if (modelSingleton) return modelSingleton;

  try {
    const { AutoProcessor, AutoModel } = await import("@xenova/transformers");
    const processor = await AutoProcessor.from_pretrained("Xenova/wavlm-base-plus-sv");
    const model = await AutoModel.from_pretrained("Xenova/wavlm-base-plus-sv", {
      quantized: true,
    });
    modelSingleton = { processor, model };
    console.log("[voice-id] WavLM model loaded (Xenova/wavlm-base-plus-sv)");
    return modelSingleton;
  } catch (err) {
    console.error("[voice-id] Failed to load WavLM model:", err);
    throw err;
  }
}

function l2Normalize(vec: Float32Array | number[]): Float32Array {
  const arr = vec instanceof Float32Array ? vec : new Float32Array(vec);
  let norm = 0;
  for (let i = 0; i < arr.length; i++) {
    norm += arr[i] * arr[i];
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return arr;
  for (let i = 0; i < arr.length; i++) {
    arr[i] /= norm;
  }
  return arr;
}

function resample(audio: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return audio;
  const ratio = toRate / fromRate;
  const newLength = Math.round(audio.length * ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const pos = i / ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = audio[Math.min(idx, audio.length - 1)] ?? 0;
    const b = audio[Math.min(idx + 1, audio.length - 1)] ?? 0;
    result[i] = a + frac * (b - a);
  }
  return result;
}

function meanPool(tensor: any): Float32Array {
  const { data, dims } = tensor;
  const batchSize = dims[0];
  const timeSteps = dims[1];
  const featureDim = dims[2];
  const pooled = new Float32Array(featureDim);
  for (let b = 0; b < batchSize; b++) {
    for (let t = 0; t < timeSteps; t++) {
      for (let d = 0; d < featureDim; d++) {
        const idx = b * timeSteps * featureDim + t * featureDim + d;
        pooled[d] += data[idx];
      }
    }
  }
  for (let d = 0; d < featureDim; d++) {
    pooled[d] /= timeSteps * batchSize;
  }
  return pooled;
}

export async function embed(pcm: Float32Array, sampleRate = 16000): Promise<Float32Array> {
  const { processor, model } = await getModel();
  const audio = resample(pcm, sampleRate, 16000);
  const inputs = await processor(audio);
  const output = await model(inputs);
  const embedding = output.embeddings ?? meanPool(output.last_hidden_state);
  return l2Normalize(embedding);
}

export function cosineSim(a: Float32Array | number[], b: Float32Array | number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export { l2Normalize };
