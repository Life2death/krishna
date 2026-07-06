import { describe, it, expect, beforeAll } from "vitest";
import { setDriver } from "@krishna/core/database/driver";
import { matchCannedResponse } from "@/lib/canned-responses";
import { makeFakeVoiceLinesDriver } from "./support/voice-lines-fake-driver";

// matchCannedResponse now sources its wording from the DB-backed voice-lines
// variety engine (pickLine), so give it a working in-memory driver; pickLine
// lazily seeds on first use.
beforeAll(() => {
  setDriver(makeFakeVoiceLinesDriver() as never);
});

describe("matchCannedResponse", () => {
  describe("language detection", () => {
    it("detects English greeting", async () => {
      const r = await matchCannedResponse("good morning", "sir");
      expect(r).not.toBeNull();
      expect(r!.intent).toBe("greeting");
      expect(r!.response).toMatch(/sir/);
    });

    it("detects Hindi greeting", async () => {
      const r = await matchCannedResponse("नमस्ते", "sir");
      expect(r).not.toBeNull();
      expect(r!.intent).toBe("greeting");
      // Devanagari response (specific wording varies with the variety engine)
      expect(r!.response).toMatch(/[ऀ-ॿ]/);
    });

    it("detects Marathi greeting", async () => {
      const r = await matchCannedResponse("नमस्कार", "sir");
      expect(r).not.toBeNull();
      expect(r!.intent).toBe("greeting");
    });
  });

  describe("intent detection", () => {
    it("matches 'hi' as greeting", async () => {
      const r = await matchCannedResponse("hi", "sir");
      expect(r).not.toBeNull();
    });

    it("matches 'hello' as greeting", async () => {
      const r = await matchCannedResponse("hello there", "sir");
      expect(r).not.toBeNull();
    });

    it("matches 'good morning' as greeting", async () => {
      const r = await matchCannedResponse("good morning", "sir");
      expect(r).not.toBeNull();
    });

    it("matches 'good afternoon' as greeting", async () => {
      const r = await matchCannedResponse("good afternoon", "sir");
      expect(r).not.toBeNull();
    });

    it("matches 'thanks'", async () => {
      const r = await matchCannedResponse("thanks", "sir");
      expect(r).not.toBeNull();
    });

    it("matches 'thank you'", async () => {
      const r = await matchCannedResponse("thank you", "sir");
      expect(r).not.toBeNull();
    });

    it("matches 'yes' as acknowledgment", async () => {
      const r = await matchCannedResponse("yes", "sir");
      expect(r).not.toBeNull();
    });

    it("matches 'okay' as acknowledgment", async () => {
      const r = await matchCannedResponse("okay", "sir");
      expect(r).not.toBeNull();
    });

    it("matches 'sure' as acknowledgment", async () => {
      const r = await matchCannedResponse("sure", "sir");
      expect(r).not.toBeNull();
    });
  });

  describe("no match", () => {
    it("returns null for a complex command", async () => {
      const r = await matchCannedResponse("open my email and check for new messages", "sir");
      expect(r).toBeNull();
    });

    it("returns null for random text", async () => {
      const r = await matchCannedResponse("what is the weather like today", "sir");
      expect(r).toBeNull();
    });

    // P2-F1 regression guards: substring patterns must NOT hijack real commands
    it("does NOT hijack 'hey Krishna, open Chrome and search flights'", async () => {
      const r = await matchCannedResponse("hey Krishna, open Chrome and search flights", "sir");
      expect(r).toBeNull();
    });

    it("does NOT hijack 'set an alarm for the morning'", async () => {
      const r = await matchCannedResponse("set an alarm for the morning", "sir");
      expect(r).toBeNull();
    });

    it("does NOT hijack 'ok now open youtube'", async () => {
      const r = await matchCannedResponse("ok now open youtube", "sir");
      expect(r).toBeNull();
    });

    it("does NOT hijack 'sure, and also remind me at 5'", async () => {
      const r = await matchCannedResponse("sure, and also remind me at 5", "sir");
      expect(r).toBeNull();
    });

    it("does NOT hijack Hindi command 'नमस्ते, यूट्यूब खोलो'", async () => {
      const r = await matchCannedResponse("नमस्ते, यूट्यूब खोलो", "sir");
      expect(r).toBeNull();
    });
  });

  describe("honorific interpolation", () => {
    it("uses provided honorific in response", async () => {
      const r = await matchCannedResponse("good morning", "boss");
      expect(r).not.toBeNull();
      expect(r!.response).toMatch(/boss/);
    });
  });
});
