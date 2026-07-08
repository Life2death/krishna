import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { stripActionFences } from "@/lib/sentence-stream";

// Mock the hooks module so LiveTranscript gets a controlled useKrishna
vi.mock("@/hooks", () => ({
  useKrishna: vi.fn(),
}));

import { useKrishna } from "@/hooks";

function mockKrishna(overrides: Record<string, any> = {}) {
  vi.mocked(useKrishna).mockReturnValue({
    status: "idle",
    pendingCommand: null,
    streamingReply: "",
    lastSpoken: "",
    ...overrides,
  });
}

describe("LiveTranscript", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("stripActionFences", () => {
    it("removes fenced action blocks from streaming reply", () => {
      const input = 'The time is 3 PM. ```action { "tool": "check_time" } ``` Is there anything else?';
      expect(stripActionFences(input)).toBe("The time is 3 PM. Is there anything else?");
    });

    it("removes fenced plan blocks", () => {
      const input = 'Let me check that. ```plan { "steps": [] } ``` Okay, done.';
      expect(stripActionFences(input)).toBe("Let me check that. Okay, done.");
    });

    it("handles no fences", () => {
      expect(stripActionFences("Hello world.")).toBe("Hello world.");
    });

    it("handles empty string", () => {
      expect(stripActionFences("")).toBe("");
    });

    it("removes multiple fence blocks", () => {
      const input = 'A. ```action { "x": 1 } ``` B. ```plan { "y": 2 } ``` C.';
      const result = stripActionFences(input);
      expect(result).not.toContain("action");
      expect(result).not.toContain("plan");
      expect(result).toContain("A.");
      expect(result).toContain("B.");
      expect(result).toContain("C.");
    });
  });

  describe("component rendering", () => {
    it("shows empty state when idle with no history", async () => {
      mockKrishna({ status: "idle", pendingCommand: null, streamingReply: "", lastSpoken: "" });
      const { LiveTranscript } = await import("@/components/LiveTranscript");
      render(<LiveTranscript />);
      expect(screen.getByText("Speak to see the transcript appear here.")).toBeDefined();
    });

    it("shows user command text", async () => {
      mockKrishna({ status: "thinking", pendingCommand: "what time is it" });
      const { LiveTranscript } = await import("@/components/LiveTranscript");
      render(<LiveTranscript />);
      expect(screen.getByText("what time is it")).toBeDefined();
      expect(screen.getByText("You")).toBeDefined();
    });

    it("shows streaming reply with fence content stripped", async () => {
      mockKrishna({
        status: "speaking",
        pendingCommand: "what time is it",
        streamingReply: "The time is 3 PM. ```action { \"tool\": \"check_time\" } ```",
      });
      const { LiveTranscript } = await import("@/components/LiveTranscript");
      render(<LiveTranscript />);
      expect(screen.getByText("The time is 3 PM.")).toBeDefined();
      expect(screen.queryByText(/action/)).toBeNull();
    });

    it("shows lastSpoken when idle after a turn", async () => {
      mockKrishna({
        status: "idle",
        pendingCommand: null,
        streamingReply: "",
        lastSpoken: "The time is 3 PM.",
      });
      const { LiveTranscript } = await import("@/components/LiveTranscript");
      render(<LiveTranscript />);
      expect(screen.getByText("The time is 3 PM.")).toBeDefined();
      expect(screen.queryByText("Speak to see the transcript appear here.")).toBeNull();
    });
  });
});
