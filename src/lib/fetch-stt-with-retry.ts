import { fetchSTT, type STTParams } from "@krishna/core/functions";

const ATTEMPT_TIMEOUT = 8000;

export type SttFetchFn = (params: STTParams) => Promise<string>;

export async function fetchSTTWithRetry(
  fetchFn: SttFetchFn,
  params: STTParams,
): Promise<string> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT);
    try {
      const result = await fetchFn({
        ...params,
        signal: controller.signal,
      });
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === 1) {
        console.warn(`[stt] retry (attempt 1 failed: ${err instanceof Error ? err.message : String(err)})`);
        continue;
      }
      throw err;
    }
  }
  throw new Error("STT failed after 2 attempts");
}

export function fetchSTTWithRetryDefault(params: STTParams): Promise<string> {
  return fetchSTTWithRetry(fetchSTT, params);
}
