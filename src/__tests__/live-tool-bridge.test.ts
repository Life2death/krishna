import { describe, it, expect } from "vitest";
import {
  getRealtimeTools,
  classifyRealtimeTool,
  mapFunctionNameToAction,
} from "@/lib/realtime/live-tool-bridge";

describe("getRealtimeTools", () => {
  it("returns an array of tool definitions", () => {
    const tools = getRealtimeTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it("each tool has name, description, and parameters", () => {
    const tools = getRealtimeTools();
    for (const t of tools) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.parameters.type).toBe("object");
      expect(t.parameters.properties).toBeDefined();
      expect(Array.isArray(t.parameters.required)).toBe(true);
    }
  });

  it("open_target has target as required", () => {
    const t = getRealtimeTools().find((x) => x.name === "open_target");
    expect(t).toBeDefined();
    expect(t!.parameters.required).toContain("target");
  });

  it("gmail_send_email has to, subject, body as required", () => {
    const t = getRealtimeTools().find((x) => x.name === "gmail_send_email");
    expect(t).toBeDefined();
    expect(t!.parameters.required).toContain("to");
    expect(t!.parameters.required).toContain("subject");
    expect(t!.parameters.required).toContain("body");
  });
});

describe("classifyRealtimeTool", () => {
  it("classifies open_target as safe", () => {
    expect(classifyRealtimeTool("open_target")).toBe("safe");
  });

  it("classifies web_search as safe", () => {
    expect(classifyRealtimeTool("web_search")).toBe("safe");
  });

  it("classifies gmail_send_email as sensitive", () => {
    expect(classifyRealtimeTool("gmail_send_email")).toBe("sensitive");
  });

  it("classifies control_window as sensitive", () => {
    expect(classifyRealtimeTool("control_window")).toBe("sensitive");
  });

  it("classifies get_travel_time as sensitive", () => {
    expect(classifyRealtimeTool("get_travel_time")).toBe("sensitive");
  });

  it("uses verb-based heuristics for unknown tools", () => {
    expect(classifyRealtimeTool("send_anything")).toBe("sensitive");
    expect(classifyRealtimeTool("delete_something")).toBe("sensitive");
    expect(classifyRealtimeTool("lookup_data")).toBe("sensitive");
  });
});

describe("mapFunctionNameToAction", () => {
  it("keeps open_target mapped to the registered core tool", () => {
    expect(mapFunctionNameToAction("open_target")).toBe("open_target");
  });

  it("keeps gmail_send_email mapped to the registered core tool", () => {
    expect(mapFunctionNameToAction("gmail_send_email")).toBe("gmail_send_email");
  });

  it("maps unknown names to themselves", () => {
    expect(mapFunctionNameToAction("foo_bar")).toBe("foo_bar");
  });
});
