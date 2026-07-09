export interface RealtimePricing {
  inputPer1M: number;
  outputPer1M: number;
}

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  userSpeechSeconds: number;
  assistantSpeechSeconds: number;
}

const DEFAULT_PRICING: Record<string, RealtimePricing> = {
  "gpt-realtime-2.1": { inputPer1M: 32, outputPer1M: 64 },
  "gpt-realtime-1-preview": { inputPer1M: 32, outputPer1M: 64 },
  "gpt-realtime-mini-2.1": { inputPer1M: 10, outputPer1M: 20 },
};

const USER_TOKENS_PER_SECOND = 10;
const ASSISTANT_TOKENS_PER_SECOND = 20;

export function getRealtimePricing(model: string): RealtimePricing {
  return (
    DEFAULT_PRICING[model] ?? { inputPer1M: 32, outputPer1M: 64 }
  );
}

export function estimateRealtimeCost(
  userSpeechMs: number,
  assistantSpeechMs: number,
  model: string = "gpt-realtime-2.1",
): CostEstimate {
  const userSpeechSeconds = userSpeechMs / 1000;
  const assistantSpeechSeconds = assistantSpeechMs / 1000;

  const inputTokens = Math.round(userSpeechSeconds * USER_TOKENS_PER_SECOND);
  const outputTokens = Math.round(assistantSpeechSeconds * ASSISTANT_TOKENS_PER_SECOND);

  const pricing = getRealtimePricing(model);

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;

  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd: Math.round((inputCost + outputCost) * 10000) / 10000,
    userSpeechSeconds,
    assistantSpeechSeconds,
  };
}

export function formatCost(costUsd: number): string {
  if (costUsd < 0.01) return "<$0.01";
  return `$${costUsd.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
