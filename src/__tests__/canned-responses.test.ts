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
  });

  describe("honorific interpolation", () => {
    it("uses provided honorific in response", () => {
      const r = matchCannedResponse("good morning", "boss");
      expect(r).not.toBeNull();
      expect(r!.response).toMatch(/boss/);
    });
  });
});
