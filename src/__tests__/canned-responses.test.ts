import { describe, it, expect } from "vitest";
import { matchCannedResponse } from "@/lib/canned-responses";

describe("matchCannedResponse", () => {
  describe("language detection", () => {
    it("detects English greeting", () => {
      const r = matchCannedResponse("good morning", "sir");
      expect(r).not.toBeNull();
      expect(r!.response).toMatch(/sir/);
    });

    it("detects Hindi greeting", () => {
      const r = matchCannedResponse("नमस्ते", "sir");
      expect(r).not.toBeNull();
      expect(r!.response).toMatch(/नमस्ते|नमस्कार|सुप्रभात|हैलो/);
    });

    it("detects Marathi greeting", () => {
      const r = matchCannedResponse("नमस्कार", "sir");
      expect(r).not.toBeNull();
    });
  });

  describe("intent detection", () => {
    it("matches 'hi' as greeting", () => {
      const r = matchCannedResponse("hi", "sir");
      expect(r).not.toBeNull();
    });

    it("matches 'hello' as greeting", () => {
      const r = matchCannedResponse("hello there", "sir");
      expect(r).not.toBeNull();
    });

    it("matches 'good morning' as greeting", () => {
      const r = matchCannedResponse("good morning", "sir");
      expect(r).not.toBeNull();
    });

    it("matches 'good afternoon' as greeting", () => {
      const r = matchCannedResponse("good afternoon", "sir");
      expect(r).not.toBeNull();
    });

    it("matches 'thanks'", () => {
      const r = matchCannedResponse("thanks", "sir");
      expect(r).not.toBeNull();
    });

    it("matches 'thank you'", () => {
      const r = matchCannedResponse("thank you", "sir");
      expect(r).not.toBeNull();
    });

    it("matches 'yes' as acknowledgment", () => {
      const r = matchCannedResponse("yes", "sir");
      expect(r).not.toBeNull();
    });

    it("matches 'okay' as acknowledgment", () => {
      const r = matchCannedResponse("okay", "sir");
      expect(r).not.toBeNull();
    });

    it("matches 'sure' as acknowledgment", () => {
      const r = matchCannedResponse("sure", "sir");
      expect(r).not.toBeNull();
    });
  });

  describe("no match", () => {
    it("returns null for a complex command", () => {
      const r = matchCannedResponse("open my email and check for new messages", "sir");
      expect(r).toBeNull();
    });

    it("returns null for random text", () => {
      const r = matchCannedResponse("what is the weather like today", "sir");
      expect(r).toBeNull();
    });

    // P2-F1 regression guards: substring patterns must NOT hijack real commands
    it("does NOT hijack 'hey Krishna, open Chrome and search flights'", () => {
      const r = matchCannedResponse("hey Krishna, open Chrome and search flights", "sir");
      expect(r).toBeNull();
    });

    it("does NOT hijack 'set an alarm for the morning'", () => {
      const r = matchCannedResponse("set an alarm for the morning", "sir");
      expect(r).toBeNull();
    });

    it("does NOT hijack 'ok now open youtube'", () => {
      const r = matchCannedResponse("ok now open youtube", "sir");
      expect(r).toBeNull();
    });

    it("does NOT hijack 'sure, and also remind me at 5'", () => {
      const r = matchCannedResponse("sure, and also remind me at 5", "sir");
      expect(r).toBeNull();
    });

    it("does NOT hijack Hindi command 'नमस्ते, यूट्यूब खोलो'", () => {
      const r = matchCannedResponse("नमस्ते, यूट्यूब खोलो", "sir");
      expect(r).toBeNull();
    });
  });

  describe("honorific interpolation", () => {
    it("uses provided honorific in response", () => {
      const r = matchCannedResponse("good morning", "boss");
      expect(r).not.toBeNull();
      expect(r!.response).toMatch(/boss/);
    });
  });
});
