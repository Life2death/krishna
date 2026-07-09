import { describe, it, expect } from "vitest";
import { generateLiveInstructions, LANGUAGE_INSTRUCTIONS } from "@/lib/realtime/realtime-instructions";

describe("realtime-instructions", () => {
  it("generateLiveInstructions with english includes base persona", () => {
    const result = generateLiveInstructions("english");
    expect(result).toContain("AI desktop assistant");
    expect(result).toContain("warm conversational tone");
  });

  it("generateLiveInstructions with hindi includes Hindi instruction", () => {
    const result = generateLiveInstructions("hindi");
    expect(result).toContain("natural Indian Hindi");
    expect(result).toContain("Devanagari pronunciation");
    expect(result).toContain("avoid an American accent");
  });

  it("generateLiveInstructions with marathi includes Marathi instruction", () => {
    const result = generateLiveInstructions("marathi");
    expect(result).toContain("natural Marathi");
    expect(result).toContain("Maharashtrian");
    expect(result).toContain("avoid an American accent");
  });

  it("generateLiveInstructions with hinglish includes Hinglish instruction", () => {
    const result = generateLiveInstructions("hinglish");
    expect(result).toContain("Hinglish");
    expect(result).toContain("Mix English and Hindi");
  });

  it("generateLiveInstructions uses custom persona when provided", () => {
    const result = generateLiveInstructions("english", "You are a coding assistant.");
    expect(result).toContain("coding assistant");
    expect(result).not.toContain("AI desktop assistant");
  });

  it("generateLiveInstructions includes response length when provided", () => {
    const result = generateLiveInstructions("english", undefined, "short");
    expect(result).toContain("extremely brief");
  });

  it("generateLiveInstructions with auto length omits length instruction", () => {
    const result = generateLiveInstructions("english", undefined, "auto");
    expect(result).not.toContain("extremely brief");
    expect(result).not.toContain("moderate length");
  });

  it("generateLiveInstructions includes tool availability note", () => {
    const result = generateLiveInstructions("english");
    expect(result).toContain("tools for web search, Gmail, travel");
  });

  it("LANGUAGE_INSTRUCTIONS has all four languages", () => {
    expect(LANGUAGE_INSTRUCTIONS).toHaveProperty("english");
    expect(LANGUAGE_INSTRUCTIONS).toHaveProperty("hindi");
    expect(LANGUAGE_INSTRUCTIONS).toHaveProperty("marathi");
    expect(LANGUAGE_INSTRUCTIONS).toHaveProperty("hinglish");
  });
});
