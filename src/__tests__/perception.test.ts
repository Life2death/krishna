import { describe, it, expect } from "vitest";
import { isLookCommand, isJobExtractionCommand } from "@/lib/perception";

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

describe("isJobExtractionCommand", () => {
  it('detects "run my daily job extraction"', () => {
    expect(isJobExtractionCommand("run my daily job extraction")).toBe(true);
  });

  it('detects "kick off job hunter"', () => {
    expect(isJobExtractionCommand("kick off job hunter")).toBe(true);
  });

  it('detects "fire the job-hunter"', () => {
    expect(isJobExtractionCommand("fire the job-hunter")).toBe(true);
  });

  it('detects "trigger my job extraction"', () => {
    expect(isJobExtractionCommand("trigger my job extraction")).toBe(true);
  });

  it('detects "start job hunter"', () => {
    expect(isJobExtractionCommand("start job hunter")).toBe(true);
  });

  it('rejects "open Chrome"', () => {
    expect(isJobExtractionCommand("open Chrome")).toBe(false);
  });

  it('rejects "remind me to check email"', () => {
    expect(isJobExtractionCommand("remind me to check email")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isJobExtractionCommand("")).toBe(false);
  });
});
