import { describe, it, expect } from "vitest";
import {
  estimateRealtimeCost,
  getRealtimePricing,
  formatCost,
  formatDuration,
} from "@/lib/realtime/realtime-cost";

describe("realtime-cost", () => {
  describe("estimateRealtimeCost", () => {
    it("returns zero cost for no speech", () => {
      const result = estimateRealtimeCost(0, 0);
      expect(result.inputTokens).toBe(0);
      expect(result.outputTokens).toBe(0);
      expect(result.estimatedCostUsd).toBe(0);
    });

    it("estimates cost for 5 min user + 5 min assistant speech", () => {
      const fiveMinMs = 5 * 60 * 1000;
      const result = estimateRealtimeCost(fiveMinMs, fiveMinMs);

      expect(result.userSpeechSeconds).toBe(300);
      expect(result.assistantSpeechSeconds).toBe(300);
      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.outputTokens).toBeGreaterThan(0);
      expect(result.estimatedCostUsd).toBeGreaterThan(0);
    });

    it("uses gpt-realtime-2.1 pricing by default", () => {
      const fiveMinMs = 5 * 60 * 1000;
      const result = estimateRealtimeCost(fiveMinMs, fiveMinMs);

      const pricing = getRealtimePricing("gpt-realtime-2.1");
      const expectedInputCost = (result.inputTokens / 1_000_000) * pricing.inputPer1M;
      const expectedOutputCost = (result.outputTokens / 1_000_000) * pricing.outputPer1M;
      const expected = Math.round((expectedInputCost + expectedOutputCost) * 10000) / 10000;

      expect(result.estimatedCostUsd).toBe(expected);
    });

    it("uses different pricing for mini model", () => {
      const fiveMinMs = 5 * 60 * 1000;
      const fullResult = estimateRealtimeCost(fiveMinMs, fiveMinMs, "gpt-realtime-2.1");
      const miniResult = estimateRealtimeCost(fiveMinMs, fiveMinMs, "gpt-realtime-mini-2.1");

      expect(miniResult.estimatedCostUsd).toBeLessThan(fullResult.estimatedCostUsd);
    });
  });

  describe("getRealtimePricing", () => {
    it("returns known pricing for gpt-realtime-2.1", () => {
      const pricing = getRealtimePricing("gpt-realtime-2.1");
      expect(pricing.inputPer1M).toBe(32);
      expect(pricing.outputPer1M).toBe(64);
    });

    it("returns known pricing for mini model", () => {
      const pricing = getRealtimePricing("gpt-realtime-mini-2.1");
      expect(pricing.inputPer1M).toBe(10);
      expect(pricing.outputPer1M).toBe(20);
    });

    it("returns default pricing for unknown models", () => {
      const pricing = getRealtimePricing("unknown-model");
      expect(pricing.inputPer1M).toBe(32);
      expect(pricing.outputPer1M).toBe(64);
    });
  });

  describe("formatCost", () => {
    it("formats values under $0.01", () => {
      expect(formatCost(0.005)).toBe("<$0.01");
    });

    it("formats whole dollar values", () => {
      expect(formatCost(1.5)).toBe("$1.50");
    });

    it("formats zero", () => {
      expect(formatCost(0)).toBe("<$0.01");
    });
  });

  describe("formatDuration", () => {
    it("formats zero", () => {
      expect(formatDuration(0)).toBe("00:00");
    });

    it("formats 5 minutes", () => {
      expect(formatDuration(5 * 60 * 1000)).toBe("05:00");
    });

    it("formats 1 hour 30 minutes", () => {
      expect(formatDuration(90 * 60 * 1000)).toBe("90:00");
    });
  });
});
