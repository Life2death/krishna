import { describe, it, expect } from "vitest";
import { parseActions } from "@/lib/actions";

describe("parseActions", () => {
  it("parses open action from action block", () => {
    const result = parseActions('Sure, opening YouTube.\n```action\n{"action":"open","target":"https://youtube.com"}\n```');
    expect(result.spokenText).toBe("Sure, opening YouTube.");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ action: "open", target: "https://youtube.com" });
  });

  it("parses remember action from action block", () => {
    const result = parseActions('Got it.\n```action\n{"action":"remember","key":"jobs url","value":"https://job-hunter-x5l1.onrender.com/"}\n```');
    expect(result.spokenText).toBe("Got it.");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ action: "remember", key: "jobs url", value: "https://job-hunter-x5l1.onrender.com/" });
  });

  it("parses remember action with null key", () => {
    const result = parseActions('I will remember that.\n```action\n{"action":"remember","key":null,"value":"my password is hunter2"}\n```');
    expect(result.spokenText).toBe("I will remember that.");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ action: "remember", key: null, value: "my password is hunter2" });
  });

  it("parses remember action from json block", () => {
    const result = parseActions('Noted.\n```json\n{"action":"remember","key":"homepage","value":"https://example.com"}\n```');
    expect(result.spokenText).toBe("Noted.");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toEqual({ action: "remember", key: "homepage", value: "https://example.com" });
  });

  it("parses both open and remember actions", () => {
    const result = parseActions('Sure.\n```action\n{"action":"remember","key":"jobs","value":"https://example.com"}\n```\n```action\n{"action":"open","target":"https://youtube.com"}\n```');
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toEqual({ action: "remember", key: "jobs", value: "https://example.com" });
    expect(result.actions[1]).toEqual({ action: "open", target: "https://youtube.com" });
  });

  it("ignores remember action with missing value", () => {
    const result = parseActions('```action\n{"action":"remember","key":"test"}\n```');
    expect(result.actions).toHaveLength(0);
  });

  it("returns empty actions for plain text", () => {
    const result = parseActions("Hello, how can I help you?");
    expect(result.actions).toHaveLength(0);
    expect(result.spokenText).toBe("Hello, how can I help you?");
  });

  it("strips action block from spokenText", () => {
    const result = parseActions('Opening YouTube.\n```action\n{"action":"open","target":"youtube"}\n```');
    expect(result.spokenText).toBe("Opening YouTube.");
    expect(result.actions).toHaveLength(1);
  });

  it("strips remember action block from spokenText", () => {
    const result = parseActions('Remembering that.\n```action\n{"action":"remember","key":"color","value":"blue"}\n```');
    expect(result.spokenText).toBe("Remembering that.");
    expect(result.actions).toHaveLength(1);
  });
});
