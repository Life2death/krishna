import { describe, it, expect } from "vitest";
import { isLookCommand, isJobExtractionCommand, isJobStatusCommand } from "@/lib/perception";

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

  it('detects "execute daily job pipeline"', () => {
    expect(isJobExtractionCommand("execute daily job pipeline")).toBe(true);
  });

  it('detects "run the job pipeline"', () => {
    expect(isJobExtractionCommand("run the job pipeline")).toBe(true);
  });

  it('detects "can you execute my job extraction pipeline on github"', () => {
    expect(isJobExtractionCommand("can you execute my job extraction pipeline on github")).toBe(true);
  });

  it('does not false-trigger on "do my job"', () => {
    expect(isJobExtractionCommand("do my job")).toBe(false);
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

  it('does not treat a status query as a trigger', () => {
    // "what's the job pipeline status" must NOT fire a run (status is handled separately).
    expect(isJobStatusCommand("what's the job pipeline status")).toBe(true);
  });
});

describe("isJobStatusCommand", () => {
  it('detects "what\'s the pipeline status"', () => {
    expect(isJobStatusCommand("what's the pipeline status")).toBe(true);
  });

  it('detects "did the job extraction finish"', () => {
    expect(isJobStatusCommand("did the job extraction finish")).toBe(true);
  });

  it('detects "is the job hunter done"', () => {
    expect(isJobStatusCommand("is the job hunter done")).toBe(true);
  });

  it('detects "how is the daily job pipeline"', () => {
    expect(isJobStatusCommand("how is the daily job pipeline")).toBe(true);
  });

  it('rejects the plain trigger "execute daily job pipeline"', () => {
    expect(isJobStatusCommand("execute daily job pipeline")).toBe(false);
  });

  it('rejects "open Chrome"', () => {
    expect(isJobStatusCommand("open Chrome")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isJobStatusCommand("")).toBe(false);
  });
});
