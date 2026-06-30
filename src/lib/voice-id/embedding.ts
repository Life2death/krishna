type ProgressCallback = (progress: {
  status: string;
  file: string;
  progress: number;
  loaded: number;
  total: number;
}) => void;

type ModelSingleton = {
  processor: any;
  model: any;
};

let modelSingleton: ModelSingleton | null = null;
let loadingPromise: Promise<ModelSingleton> | null = null;

export type ModelLoadStatus =
  | { status: "idle" }
  | { status: "loading"; progress: number; file: string }
  | { status: "ready" }
  | { status: "error"; error: string };

let loadStatus: ModelLoadStatus = { status: "idle" };
const subscribers: Set<(s: ModelLoadStatus) => void> = new Set();

function notify() {
  subscribers.forEach((fn) => fn(loadStatus));
}

export function subscribeToModelLoad(cb: (s: ModelLoadStatus) => void): () => void {
  subscribers.add(cb);
  cb(loadStatus);
  return () => { subscribers.delete(cb); };
}

export function getModelLoadStatus(): ModelLoadStatus {
  return loadStatus;
}

async function getModel(onProgress?: ProgressCallback): Promise<ModelSingleton> {
  if (modelSingleton) return modelSingleton;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const { AutoProcessor, AutoModel, env } = await import("@xenova/transformers");

      // Fetch the model from the Hugging Face CDN, not a local /models path.
      // transformers.js defaults to allowLocalModels=true → it first requests
      // /models/Xenova/wavlm-base-plus-sv/... which the Vite/Tauri dev server
      // answers with index.html (SPA fallback), producing
      // "Unexpected token '<', "<!DOCTYPE"..." when parsed as JSON.
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      loadStatus = { status: "loading", progress: 0, file: "wavlm-base-plus-sv" };
      notify();

      const processor = await AutoProcessor.from_pretrained("Xenova/wavlm-base-plus-sv", {
        progress_callback: (p: any) => {
          if (p.status === "progress") {
            loadStatus = {
              status: "loading",
              progress: p.progress ?? (p.loaded / (p.total || 1)),
              file: p.file ?? "wavlm-base-plus-sv",
            };
            notify();
            onProgress?.(p);
          }
        },
      });

      const model = await AutoModel.from_pretrained("Xenova/wavlm-base-plus-sv", {
        quantized: true,
        progress_callback: (p: any) => {
          if (p.status === "progress") {
            loadStatus = {
              status: "loading",
              progress: p.progress ?? (p.loaded / (p.total || 1)),
              file: p.file ?? "wavlm-base-plus-sv",
            };
            notify();
            onProgress?.(p);
          }
        },
      });

      modelSingleton = { processor, model };
      loadStatus = { status: "ready" };
      notify();
      return modelSingleton;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      loadStatus = { status: "error", error: msg };
      notify();
      loadingPromise = null;
      throw err;
    }
  })();

  return loadingPromise;
}

function l2Normalize(vec: Float32Array | number[]): Float32Array {
  const arr = vec instanceof Float32Array ? vec : new Float32Array(vec);
  let norm = 0;
  for (let i = 0; i < arr.length; i++) norm += arr[i] * arr[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return arr;
  for (let i = 0; i < arr.length; i++) arr[i] /= norm;
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

export async function embed(
  pcm: Float32Array,
  sampleRate = 16000,
  onProgress?: ProgressCallback,
): Promise<Float32Array> {
  const { processor, model } = await getModel(onProgress);
  const audio = resample(pcm, sampleRate, 16000);
  const inputs = await processor(audio);
  const output = await model(inputs);
  if (!output.embeddings) {
    const keys = Object.keys(output).join(", ");
    throw new Error(
      `Model output missing "embeddings" field. Available keys: [${keys}]. ` +
      "Expected the SV head (512-dim), not raw hidden states."
    );
  }
  const tensor = output.embeddings;
  if (!tensor.data || !tensor.dims) {
    throw new Error(
      `embeddings tensor has unexpected structure: ${JSON.stringify(Object.keys(tensor))}`
    );
  }
  const flat: Float32Array = tensor.data instanceof Float32Array
    ? tensor.data
    : new Float32Array(tensor.data as ArrayLike<number>);
  return l2Normalize(flat);
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
