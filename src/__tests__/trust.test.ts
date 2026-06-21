import { describe, it, expect } from "vitest";
import { classifyAction } from "@krishna/core";
import { isUndoCommand } from "@/lib/perception";

describe("classifyAction", () => {
  it('classifies "open" as safe', () => {
    expect(classifyAction("open")).toBe("safe");
  });

  it('classifies "look" as safe', () => {
    expect(classifyAction("look")).toBe("safe");
  });

  it('classifies "youtube_search" as safe', () => {
    expect(classifyAction("youtube_search")).toBe("safe");
  });

  it('classifies "web_search" as safe', () => {
    expect(classifyAction("web_search")).toBe("safe");
  });

  it('classifies "delete_file" as sensitive', () => {
    expect(classifyAction("delete_file")).toBe("sensitive");
  });

  it('classifies "unknown_tool" as sensitive', () => {
    expect(classifyAction("unknown_tool")).toBe("sensitive");
  });
});

describe("isUndoCommand", () => {
  it('detects "undo that"', () => {
    expect(isUndoCommand("undo that")).toBe(true);
  });

  it('detects "undo it"', () => {
    expect(isUndoCommand("undo it")).toBe(true);
  });

  it('detects "undo the last thing"', () => {
    expect(isUndoCommand("undo the last thing")).toBe(true);
  });

  it("rejects 'open Chrome'", () => {
    expect(isUndoCommand("open Chrome")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isUndoCommand("")).toBe(false);
  });
});
