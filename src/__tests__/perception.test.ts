import { describe, it, expect } from "vitest";
import { isLookCommand } from "@/lib/perception";

describe("isLookCommand", () => {
  it('detects "what\'s on my screen"', () => {
    expect(isLookCommand("what's on my screen")).toBe(true);
  });

  it('detects "what is this error"', () => {
    expect(isLookCommand("what is this error")).toBe(true);
  });

  it('detects "read the screen"', () => {
    expect(isLookCommand("read the screen")).toBe(true);
  });

  it('detects "summarize this page"', () => {
    expect(isLookCommand("summarize this page")).toBe(true);
  });

  it('detects "look at the screen"', () => {
    expect(isLookCommand("look at the screen")).toBe(true);
  });

  it('rejects "open Chrome"', () => {
    expect(isLookCommand("open Chrome")).toBe(false);
  });

  it('rejects "remember that..."', () => {
    expect(isLookCommand("remember that my favorite color is blue")).toBe(false);
  });

  it('rejects "remind me to..."', () => {
    expect(isLookCommand("remind me to check email")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isLookCommand("")).toBe(false);
  });
});
