import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseActions } from "@/lib/actions";
import { executePlan, resolvePlaceholders } from "@/lib/executor";
import { getTool, getAllTools } from "@/lib/tools";
import { openTargetTool } from "@/lib/tools/open-target";
import { youtubeSearchTool } from "@/lib/tools/youtube-search";
import { webSearchTool } from "@/lib/tools/web-search";
import { invoke } from "@tauri-apps/api/core";

// --- parsePlan via parseActions ---------------------------------------------

describe("parsePlan (via parseActions)", () => {
  it("parses a multi-step plan from ```plan block", () => {
    const reply = [
      "I will search YouTube and play the song.",
      '```plan',
      JSON.stringify({
        say: "I'll search YouTube for the song and play it.",
        needsConfirmation: true,
        plan: [
          { tool: "youtube_search", args: { query: "Tum Hi Ho" }, out: "videoId" },
          { tool: "open_target", args: { target: "https://youtube.com/watch?v=${videoId}" } },
        ],
      }),
      '```',
    ].join("\n");

    const result = parseActions(reply);
    expect(result.plan).toBeDefined();
    expect(result.plan!.steps).toHaveLength(2);
    expect(result.plan!.steps[0].tool).toBe("youtube_search");
    expect(result.plan!.steps[0].args.query).toBe("Tum Hi Ho");
    expect(result.plan!.steps[0].out).toBe("videoId");
    expect(result.plan!.steps[1].tool).toBe("open_target");
    expect(result.plan!.needsConfirmation).toBe(true);
  });

  it("falls back to legacy action parsing when no plan block", () => {
    const reply = [
      "Opening Firefox",
      '```action',
      '{"action":"open","target":"firefox"}',
      '```',
    ].join("\n");

    const result = parseActions(reply);
    expect(result.plan).toBeUndefined();
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].target).toBe("firefox");
  });

  it("parses a single open_target plan as legacy action too", () => {
    const reply = [
      "Opening YouTube",
      '```plan',
      JSON.stringify({
        say: "Opening YouTube",
        needsConfirmation: false,
        plan: [
          { tool: "open_target", args: { target: "https://youtube.com" } },
        ],
      }),
      '```',
    ].join("\n");

    const result = parseActions(reply);
    expect(result.plan).toBeDefined();
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].action).toBe("open");
    expect(result.actions[0].target).toBe("https://youtube.com");
  });

  it("extracts spoken text from the reply", () => {
    const reply = [
      "I'll search and play it for you.",
      '```plan',
      JSON.stringify({
        say: "I'll search YouTube for the song and play it.",
        needsConfirmation: true,
        plan: [{ tool: "youtube_search", args: { query: "test" }, out: "id" }],
      }),
      '```',
    ].join("\n");

    const result = parseActions(reply);
    expect(result.spokenText).toBe("I'll search and play it for you.");
  });

  it("handles invalid plan JSON gracefully", () => {
    const reply = [
      "Hello",
      '```plan',
      "not valid json",
      '```',
    ].join("\n");

    const result = parseActions(reply);
    expect(result.plan).toBeUndefined();
    expect(result.spokenText).toBe("Hello");
  });
});

// --- resolvePlaceholders ----------------------------------------------------

describe("resolvePlaceholders", () => {
  it("replaces ${var} with value from vars map", () => {
    expect(resolvePlaceholders("Hello ${name}", { name: "World" })).toBe("Hello World");
  });

  it("replaces multiple placeholders", () => {
    expect(
      resolvePlaceholders("${a} + ${b} = ${c}", { a: "1", b: "2", c: "3" })
    ).toBe("1 + 2 = 3");
  });

  it("leaves unresolved placeholders untouched", () => {
    expect(resolvePlaceholders("${a} and ${b}", { a: "x" })).toBe("x and ${b}");
  });

  it("handles empty template", () => {
    expect(resolvePlaceholders("", { a: "1" })).toBe("");
  });

  it("handles template with no placeholders", () => {
    expect(resolvePlaceholders("just text", { a: "1" })).toBe("just text");
  });
});

// --- Tool Registry ----------------------------------------------------------

describe("Tool Registry", () => {
  it("returns all registered tools", () => {
    const tools = getAllTools();
    expect(tools.length).toBeGreaterThanOrEqual(3);
    const names = tools.map((t) => t.name);
    expect(names).toContain("open_target");
    expect(names).toContain("youtube_search");
    expect(names).toContain("web_search");
  });

  it("looks up a tool by name", () => {
    const tool = getTool("open_target");
    expect(tool).toBeDefined();
    expect(tool!.name).toBe("open_target");
  });

  it("returns undefined for unknown tool", () => {
    const tool = getTool("nonexistent_tool");
    expect(tool).toBeUndefined();
  });

  it("each tool has name, description and run function", () => {
    const tools = getAllTools();
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(typeof tool.run).toBe("function");
    }
  });
});

// --- open_target tool (contract test with actual Rust return shape) -------

describe("open_target tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes Rust open_target with correct arg key (target)", async () => {
    // The Rust #[tauri::command] signature:
    //   pub fn open_target(app_handle: tauri::AppHandle, target: String) -> Result<String, String>
    // Return type: Result<String, String> -> on success, returns String like "Opened URL: ..."
    (invoke as any).mockResolvedValue("Opened URL: https://youtube.com");

    const result = await openTargetTool.run({ target: "https://youtube.com" }, { vars: {} });

    // Verify the arg key matches Rust param name EXACTLY
    expect(invoke).toHaveBeenCalledWith("open_target", { target: "https://youtube.com" });
    expect(result.success).toBe(true);
    expect(result.output).toBe("Opened URL: https://youtube.com");
  });

  it("returns error for missing target arg", async () => {
    const result = await openTargetTool.run({}, { vars: {} });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing required arg");
  });

  it("handles invoke failure gracefully", async () => {
    (invoke as any).mockRejectedValue(new Error("Failed to open"));

    const result = await openTargetTool.run({ target: "bad://url" }, { vars: {} });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// --- youtube_search tool ----------------------------------------------------

describe("youtube_search tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock localStorage
    const store: Record<string, string> = {};
    vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => store[key] ?? null);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, val) => { store[key] = val; });
  });

  it("falls back to deep-link when no API key configured", async () => {
    const result = await youtubeSearchTool.run({ query: "Tum Hi Ho" }, { vars: {} });
    expect(result.success).toBe(true);
    expect(result.data!.url).toContain("youtube.com/results");
    expect(result.data!.fallback).toBe("true");
  });

  it("returns error for missing query arg", async () => {
    const result = await youtubeSearchTool.run({}, { vars: {} });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing required arg");
  });
});

// --- web_search tool --------------------------------------------------------

describe("web_search tool", () => {
  it("returns a search URL", async () => {
    const result = await webSearchTool.run({ query: "test query" }, { vars: {} });
    expect(result.success).toBe(true);
    expect(result.data!.url).toContain("google.com/search");
  });

  it("returns error for missing query arg", async () => {
    const result = await webSearchTool.run({}, { vars: {} });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing required arg");
  });
});

// --- Executor ---------------------------------------------------------------

describe("executePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes steps in order and accumulates variables", async () => {
    (invoke as any).mockResolvedValue("Opened successfully");

    const steps = [
      { tool: "open_target", args: { target: "https://example.com" }, out: "result" },
      { tool: "open_target", args: { target: "https://example.com/${result}" } },
    ];

    const result = await executePlan(steps);
    expect(result.success).toBe(true);
    expect(result.stepResults).toHaveLength(2);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("stops on first error and returns partial results", async () => {
    (invoke as any)
      .mockResolvedValueOnce("OK")
      .mockRejectedValueOnce(new Error("Step failed"));

    const steps = [
      { tool: "open_target", args: { target: "step1" } },
      { tool: "open_target", args: { target: "step2" } },
      { tool: "open_target", args: { target: "step3" } },
    ];

    const result = await executePlan(steps);
    expect(result.success).toBe(false);
    expect(result.stepResults).toHaveLength(2);
    expect(result.error).toContain("Step failed");
  });

  it("rejects unknown tools", async () => {
    const steps = [
      { tool: "nonexistent_tool", args: {} },
    ];

    const result = await executePlan(steps);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown tool");
  });

  it("handles empty plan", async () => {
    const result = await executePlan([]);
    expect(result.success).toBe(true);
    expect(result.stepResults).toHaveLength(0);
  });

  it("substitutes variables from prior step out values", async () => {
    // Mock youtube_search to return a videoId
    (invoke as any).mockResolvedValue("OK");

    const steps = [
      {
        tool: "open_target",
        args: { target: "https://youtube.com/watch?v=${videoId}&autoplay=1" },
      },
    ];

    const result = await executePlan(steps, { vars: { videoId: "abc123" } });
    expect(result.success).toBe(true);
    expect(invoke).toHaveBeenCalledWith("open_target", {
      target: "https://youtube.com/watch?v=abc123&autoplay=1",
    });
  });

  it("respects cancellation signal", async () => {
    const controller = new AbortController();
    controller.abort();

    const steps = [
      { tool: "open_target", args: { target: "test" } },
    ];

    const result = await executePlan(steps, { signal: controller.signal });
    expect(result.success).toBe(false);
    expect(result.error).toContain("cancelled");
  });
});
