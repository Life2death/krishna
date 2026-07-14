import { describe, it, expect, beforeEach, vi } from "vitest";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
  };
})();

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Mock the data layer the learning loop depends on.
const getRecentActivity = vi.fn();
const getAllMemories = vi.fn();
const createMemory = vi.fn();
const deleteMemory = vi.fn();

vi.mock("@/lib/database", () => ({
  getRecentActivity: (...args: unknown[]) => getRecentActivity(...args),
}));

vi.mock("@/lib/repo-bound", () => ({
  getAllMemories: (...args: unknown[]) => getAllMemories(...args),
  createMemory: (...args: unknown[]) => createMemory(...args),
  deleteMemory: (...args: unknown[]) => deleteMemory(...args),
}));

import {
  isPassiveLearningEnabled,
  setPassiveLearningEnabled,
  runStyleDistillation,
  forgetStyleProfile,
  STYLE_MEMORY_KEY,
} from "@/lib/learning";

const PASSIVE_KEY = "krishna_passive_learning_enabled";

function makeUtterances(n: number, base = 0) {
  return Array.from({ length: n }, (_, i) => ({
    source: "voice",
    transcript: `utterance ${i}`,
    createdAt: base + i,
  }));
}

describe("isPassiveLearningEnabled", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to true when nothing is stored", () => {
    expect(isPassiveLearningEnabled()).toBe(true);
  });

  it("returns false only when explicitly disabled", () => {
    setPassiveLearningEnabled(false);
    expect(localStorage.getItem(PASSIVE_KEY)).toBe("false");
    expect(isPassiveLearningEnabled()).toBe(false);

    setPassiveLearningEnabled(true);
    expect(isPassiveLearningEnabled()).toBe(true);
  });
});

describe("runStyleDistillation gating", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    getAllMemories.mockResolvedValue([]);
    createMemory.mockResolvedValue({});
    // Plenty of fresh utterances so only the toggle/force gate matters.
    getRecentActivity.mockResolvedValue(makeUtterances(30, 1000));
  });

  it("early-returns false (no LLM call) when passive learning is disabled", async () => {
    setPassiveLearningEnabled(false);
    const runLLM = vi.fn().mockResolvedValue("- speaks casually");

    const result = await runStyleDistillation(runLLM);

    expect(result).toBe(false);
    expect(runLLM).not.toHaveBeenCalled();
    expect(createMemory).not.toHaveBeenCalled();
  });

  it("still runs under force even when disabled", async () => {
    setPassiveLearningEnabled(false);
    const runLLM = vi.fn().mockResolvedValue("- speaks casually");

    const result = await runStyleDistillation(runLLM, { force: true });

    expect(result).toBe(true);
    expect(runLLM).toHaveBeenCalledTimes(1);
    expect(createMemory).toHaveBeenCalledTimes(1);
    expect(createMemory).toHaveBeenCalledWith(
      expect.objectContaining({ key: STYLE_MEMORY_KEY, value: "- speaks casually" }),
    );
  });

  it("runs passively when enabled and enough new utterances exist", async () => {
    // default enabled
    const runLLM = vi.fn().mockResolvedValue("- friendly tone");

    const result = await runStyleDistillation(runLLM);

    expect(result).toBe(true);
    expect(runLLM).toHaveBeenCalledTimes(1);
  });
});

describe("forgetStyleProfile", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    deleteMemory.mockResolvedValue(true);
  });

  it("deletes the style memory by id when present", async () => {
    getAllMemories.mockResolvedValue([
      { id: "mem-1", key: STYLE_MEMORY_KEY, value: "- casual" },
    ]);

    const result = await forgetStyleProfile();

    expect(result).toBe(true);
    expect(deleteMemory).toHaveBeenCalledWith("mem-1");
  });

  it("returns false and deletes nothing when no profile exists", async () => {
    getAllMemories.mockResolvedValue([]);

    const result = await forgetStyleProfile();

    expect(result).toBe(false);
    expect(deleteMemory).not.toHaveBeenCalled();
  });
});
