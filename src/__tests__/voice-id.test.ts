// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Tauri SQL plugin before any imports
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(() =>
      Promise.resolve({
        execute: vi.fn(),
        select: vi.fn(() => Promise.resolve([])),
      })
    ),
  },
}));

vi.mock("@/lib/secure-storage", () => ({
  secureStorage: {
    get: vi.fn(() => Promise.resolve("test-master-key")),
    set: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("@/lib/voice-id/embedding", () => ({
  embed: vi.fn((pcm: Float32Array) => Promise.resolve(Array.from(pcm.slice(0, 4)))),
  cosineSim: vi.fn((a: number[], b: number[]) => {
    const dot = a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
    const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    return magA && magB ? dot / (magA * magB) : 0;
  }),
  l2Normalize: vi.fn((vec: number[]) => {
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return mag ? vec.map((v) => v / mag) : vec;
  }),
}));

vi.mock("@/lib/voice-crypto", () => ({
  encryptVoiceprint: vi.fn((plain: string) => Promise.resolve(`enc:v1:${btoa(plain)}`)),
  decryptVoiceprint: vi.fn((stored: string) => {
    if (!stored.startsWith("enc:v1:")) return Promise.resolve(null);
    try {
      return Promise.resolve(atob(stored.slice(7)));
    } catch {
      return Promise.resolve(null);
    }
  }),
}));

import {
  topKMean,
  computeAdaptiveThreshold,
  evaluateMaturity,
  getVoiceStatus,
  resetEnrollment,
} from "@/lib/voice-client";
import { setDriver } from "@krishna/core/database/driver";
import {
  getAllSamples,
  addSample,
  getSampleCount,
} from "@krishna/core/database";

// In-memory mock DB
const _tables: Record<string, Map<string, any>> = {
  voiceprint_samples: new Map(),
  voiceprint_state: new Map(),
  sync_tombstones: new Map(),
  sync_state: new Map(),
};

function resetTables() {
  for (const key of Object.keys(_tables)) {
    _tables[key] = new Map();
  }
}

const driver = {
  select: vi.fn((sql: string, params?: any[]) => {
    if (sql.includes("voiceprint_samples")) {
      const samples = [..._tables.voiceprint_samples.values()];
      // COUNT(*) check must come before WHERE so aggregate queries match first
      if (/COUNT\s*\(\s*\*\s*\)/i.test(sql)) {
        const cnt = sql.includes("WHERE speaker = ?")
          ? samples.filter((s: any) => s.speaker === params?.[0]).length
          : samples.length;
        return Promise.resolve([{ cnt }] as any);
      }
      if (sql.includes("WHERE speaker = ?") && params?.length === 1) {
        return Promise.resolve(
          samples.filter((s: any) => s.speaker === params[0])
        );
      }
      if (sql.includes("WHERE id = ?") && params?.length === 1) {
        return Promise.resolve(
          samples.filter((s: any) => s.id === params[0])
        );
      }
      return Promise.resolve(samples);
    }
    if (sql.includes("voiceprint_state")) {
      const states = [..._tables.voiceprint_state.values()];
      if (sql.includes("WHERE speaker = ?") && params?.length === 1) {
        return Promise.resolve(
          states.filter((s: any) => s.speaker === params[0])
        );
      }
      return Promise.resolve(states);
    }
    return Promise.resolve([]);
  }),
  execute: vi.fn((sql: string, params?: any[]) => {
    if (sql.includes("INSERT INTO voiceprint_samples")) {
      const [id, speaker, embedding, dims, quality] = params || [];
      const now = new Date().toISOString();
      _tables.voiceprint_samples.set(id, {
        id, speaker, embedding, dims, quality, created_at: now,
      });
    }
    if (/DELETE\s+FROM\s+voiceprint_samples/i.test(sql)) {
      if (sql.includes("WHERE speaker = ?") && params?.length === 1) {
        const speaker = params[0];
        for (const [key, val] of _tables.voiceprint_samples) {
          if (val.speaker === speaker) _tables.voiceprint_samples.delete(key);
        }
      } else if (params?.length === 1) {
        _tables.voiceprint_samples.delete(params[0]);
      } else {
        _tables.voiceprint_samples.clear();
      }
    }
    if (sql.includes("voiceprint_state")) {
      if (sql.includes("INSERT")) {
        _tables.voiceprint_state.set("primary", {
          speaker: "primary",
          sample_count: params?.[1] ?? 0,
          mature: params?.[2] ?? 0,
          adaptive_threshold: params?.[3] ?? null,
          threshold_confidence: params?.[4] ?? null,
        });
      }
      if (sql.includes("DELETE")) {
        _tables.voiceprint_state.delete("primary");
      }
    }
    return Promise.resolve({ rowsAffected: 1 });
  }),
};

describe("topKMean", () => {
  it("returns 0 for empty array", () => {
    expect(topKMean([], 5)).toBe(0);
  });

  it("returns mean of all scores when fewer than k", () => {
    expect(topKMean([0.8, 0.9], 5)).toBeCloseTo(0.85, 10);
  });

  it("returns mean of top-k scores", () => {
    expect(topKMean([0.5, 0.8, 0.9, 0.7, 0.85, 0.6], 3)).toBeCloseTo(0.85, 5);
  });
});

describe("computeAdaptiveThreshold", () => {
  it("returns static threshold with zero confidence for empty selfScores", () => {
    const result = computeAdaptiveThreshold([], 0.85);
    expect(result.threshold).toBe(0.85);
    expect(result.confidence).toBe(0);
  });

  it("floors at static threshold when selfMean - k*std dips below", () => {
    const result = computeAdaptiveThreshold([0.9, 0.85, 0.88], 0.85);
    const selfMean = (0.9 + 0.85 + 0.88) / 3;
    const selfStd = Math.sqrt(
      ([0.9, 0.85, 0.88].reduce((s, v) => s + (v - selfMean) ** 2, 0)) / 3
    );
    const candidate = selfMean - 2 * selfStd;
    expect(result.threshold).toBe(Math.max(0.85, candidate));
    expect(result.confidence).toBe(3 / 24);
  });

  it("returns higher confidence with more samples", () => {
    const low = computeAdaptiveThreshold([0.9], 0.85);
    const high = computeAdaptiveThreshold(Array(12).fill(0.9), 0.85);
    expect(high.confidence).toBeGreaterThan(low.confidence);
  });
});

describe("evaluateMaturity", () => {
  it("not mature with few samples", () => {
    expect(evaluateMaturity(5, 0.8)).toBe(false);
  });

  it("mature at 12+ samples with confidence >= 0.5", () => {
    expect(evaluateMaturity(12, 0.5)).toBe(true);
    expect(evaluateMaturity(15, 0.7)).toBe(true);
  });

  it("not mature with low confidence even with enough samples", () => {
    expect(evaluateMaturity(12, 0.3)).toBe(false);
  });
});

describe("voiceprint-samples action", () => {
  beforeEach(() => {
    resetTables();
    driver.select.mockClear();
    driver.execute.mockClear();
    setDriver(driver as any);
  });

  it("addSample inserts and returns the sample", async () => {
    const sample = await addSample("test-1", "primary", "enc:test", 128);
    expect(sample.id).toBe("test-1");
    expect(sample.speaker).toBe("primary");
    expect(sample.dims).toBe(128);
  });

  it("getAllSamples returns inserted samples", async () => {
    await addSample("a", "primary", "enc:a", 128);
    await addSample("b", "primary", "enc:b", 128);
    const samples = await getAllSamples();
    expect(samples).toHaveLength(2);
  });

  it("getSampleCount returns correct count", async () => {
    await addSample("a", "primary", "enc:a", 128);
    await addSample("b", "primary", "enc:b", 128);
    const count = await getSampleCount();
    expect(count).toBe(2);
  });
});

describe("getVoiceStatus", () => {
  beforeEach(() => {
    resetTables();
    driver.select.mockClear();
    driver.execute.mockClear();
    setDriver(driver as any);
  });

  it("reports not enrolled when no samples", async () => {
    const status = await getVoiceStatus();
    expect(status.enrolled).toBe(false);
    expect(status.sampleCount).toBe(0);
    expect(status.mature).toBe(false);
  });

  it("reports enrolled after adding samples", async () => {
    await addSample("a", "primary", "enc:a", 128);
    const status = await getVoiceStatus();
    expect(status.enrolled).toBe(true);
    expect(status.sampleCount).toBe(1);
  });
});

describe("resetEnrollment", () => {
  beforeEach(() => {
    resetTables();
    driver.select.mockClear();
    driver.execute.mockClear();
    setDriver(driver as any);
  });

  it("clears all samples and state", async () => {
    await addSample("a", "primary", "enc:a", 128);
    await resetEnrollment();
    const samples = await getAllSamples();
    expect(samples).toHaveLength(0);
  });
});
