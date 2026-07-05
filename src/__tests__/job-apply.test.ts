import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { setHttpFetch } from "@krishna/core/http";
import { setSecretGetter } from "@krishna/core/secrets";

// --- Apply-button JS expression logic (JA-2 DOM heuristic) ---
// Tests the exact JS expression string that runs in Chrome via CDP,
// evaluated in jsdom via new Function().

function evalClickApplyJS(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const fn = new Function(
    "document",
    `const candidates = document.querySelectorAll('button, a');
    let externalApply = null;
    for (const el of candidates) {
      const text = (el.textContent || '').trim();
      const label = (el.getAttribute('aria-label') || '').trim();
      const lowerText = text.toLowerCase();
      const lowerLabel = label.toLowerCase();

      if (/\\bapplied\\b/.test(lowerText) || /\\bapplied\\b/.test(lowerLabel) ||
          /apply\\s*filter/.test(lowerText) || /filter\\s*apply/.test(lowerText) ||
          /apply\\s*filter/.test(lowerLabel) || /filter\\s*apply/.test(lowerLabel)) continue;

      if (/^\\s*easy\\s+apply\\b/i.test(text) || /^\\s*easy\\s+apply\\b/i.test(label)) {
        return JSON.stringify({ found: true, clicked: true, text: text, tag: el.tagName.toLowerCase() });
      }

      if (/\\bapply\\b/i.test(lowerText) || /\\bapply\\b/i.test(lowerLabel)) {
        if (!externalApply) {
          externalApply = { text: text, tag: el.tagName.toLowerCase() };
        }
      }
    }
    if (externalApply) {
      return JSON.stringify({ found: true, clicked: false, reason: "external ATS apply — out of MVP scope" });
    }
    return JSON.stringify({ found: false });`,
  );
  return fn(doc);
}

describe("clickApplyButton DOM heuristic (JA-2)", () => {
  it("finds and clicks Easy Apply button", () => {
    const result = JSON.parse(evalClickApplyJS('<html><body><button>Easy Apply</button></body></html>'));
    expect(result.found).toBe(true);
    expect(result.clicked).toBe(true);
    expect(result.text).toBe("Easy Apply");
    expect(result.tag).toBe("button");
  });

  it("finds Easy Apply by aria-label", () => {
    const result = JSON.parse(evalClickApplyJS('<html><body><button aria-label="Easy Apply now">Click</button></body></html>'));
    expect(result.found).toBe(true);
    expect(result.clicked).toBe(true);
    expect(result.text).toBe("Click");
  });

  it("does not click external Apply button, returns reason", () => {
    const result = JSON.parse(evalClickApplyJS('<html><body><button>Apply Now</button></body></html>'));
    expect(result.found).toBe(true);
    expect(result.clicked).toBe(false);
    expect(result.reason).toContain("external ATS apply");
  });

  it("does not click external Apply link, returns reason", () => {
    const result = JSON.parse(evalClickApplyJS('<html><body><a>Apply for this job</a></body></html>'));
    expect(result.found).toBe(true);
    expect(result.clicked).toBe(false);
  });

  it("does not match 'applied' text", () => {
    const result = JSON.parse(evalClickApplyJS('<html><body><button>Already Applied</button></body></html>'));
    expect(result.found).toBe(false);
  });

  it("does not match 'apply filters' text", () => {
    const result = JSON.parse(evalClickApplyJS('<html><body><button>Apply Filters</button></body></html>'));
    expect(result.found).toBe(false);
  });

  it("does not match 'filter apply' text", () => {
    const result = JSON.parse(evalClickApplyJS('<html><body><button>Filter Apply</button></body></html>'));
    expect(result.found).toBe(false);
  });

  it("returns not found when no apply-related element exists", () => {
    const result = JSON.parse(evalClickApplyJS('<html><body><button>Cancel</button><a>Learn more</a></body></html>'));
    expect(result.found).toBe(false);
  });

  it("is case-insensitive for Easy Apply", () => {
    const result = JSON.parse(evalClickApplyJS('<html><body><button>EASY APPLY</button></body></html>'));
    expect(result.found).toBe(true);
    expect(result.clicked).toBe(true);
  });

  it("prefers Easy Apply over external Apply when both present", () => {
    const result = JSON.parse(evalClickApplyJS('<html><body><button>Easy Apply</button><a>Apply Here</a></body></html>'));
    expect(result.found).toBe(true);
    expect(result.clicked).toBe(true);
    expect(result.text).toBe("Easy Apply");
  });
});

// --- CDP target selection tests ---

describe("CdpClient.listTargets", () => {
  beforeEach(() => {
    setSecretGetter(async () => "test-token");
  });

  it("selects page-type targets from /json response", async () => {
    const mockTargets = [
      { id: "1", title: "New Tab", url: "chrome://newtab/", webSocketDebuggerUrl: "ws://localhost:9222/devtools/page/1", type: "page" },
      { id: "2", title: "LinkedIn", url: "https://linkedin.com/", webSocketDebuggerUrl: "ws://localhost:9222/devtools/page/2", type: "page" },
      { id: "3", title: "background", url: "", webSocketDebuggerUrl: "ws://localhost:9222/devtools/page/3", type: "iframe" },
    ];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockTargets,
    });
    setHttpFetch(mockFetch as any);

    const { CdpClient } = await import("@krishna/core/tools/cdp-client");
    const client = new CdpClient();
    const targets = await client.listTargets();

    expect(targets).toHaveLength(2);
    expect(targets[0].title).toBe("New Tab");
    expect(targets[1].title).toBe("LinkedIn");
    expect(targets.every((t) => !t.type || t.type === "page")).toBe(true);
  });

  it("returns empty array when /json returns no page targets", async () => {
    const mockTargets = [
      { id: "4", title: "bg", url: "", webSocketDebuggerUrl: "ws://localhost:9222/devtools/page/4", type: "iframe" },
    ];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockTargets,
    });
    setHttpFetch(mockFetch as any);

    const { CdpClient } = await import("@krishna/core/tools/cdp-client");
    const client = new CdpClient();
    const targets = await client.listTargets();

    expect(targets).toHaveLength(0);
  });

  it("throws when /json fails", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    setHttpFetch(mockFetch as any);

    const { CdpClient } = await import("@krishna/core/tools/cdp-client");
    const client = new CdpClient();
    await expect(client.listTargets()).rejects.toThrow("Chrome DevTools returned 500");
  });
});

// --- Real-path CDP evaluate test (JA-1) ---

describe("CdpClient.evaluate CDP response unwrapping (JA-1)", () => {
  beforeEach(() => {
    setSecretGetter(async () => "test-token");
  });

  it("extracts value from nested CDP Runtime.evaluate response", async () => {
    const { CdpClient } = await import("@krishna/core/tools/cdp-client");
    const client = new CdpClient();
    client.send = vi.fn().mockResolvedValue({
      result: { type: "string", value: '{"found":true,"clicked":true,"text":"Easy Apply","tag":"button"}' },
    });

    const result = await client.evaluate<string>("document.title");
    expect(JSON.parse(result)).toEqual({
      found: true, clicked: true, text: "Easy Apply", tag: "button",
    });
  });

  it("throws on exceptionDetails from CDP", async () => {
    const { CdpClient } = await import("@krishna/core/tools/cdp-client");
    const client = new CdpClient();
    client.send = vi.fn().mockResolvedValue({
      result: { type: "object" },
      exceptionDetails: { text: "ReferenceError: foo is not defined" },
    });

    await expect(client.evaluate<string>("foo()")).rejects.toThrow("ReferenceError");
  });
});

// --- Graceful 9222 unreachable (tool-level message) ---

describe("getJobApplyTool graceful error", () => {
  beforeEach(() => {
    setSecretGetter(async () => "test-token");
  });

  it("returns friendly message when Chrome not reachable", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string, _opts?: any) => {
      if (url.includes("job-hunter-x5l1")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            rows: [{ job_id: "j1", title: "Engineer", company: "Acme", url: "https://linkedin.com/apply/123", portal: "LinkedIn" }],
            total: 1,
          }),
        };
      }
      throw new Error("fetch failed");
    });
    setHttpFetch(mockFetch as any);

    const { getJobApplyTool } = await import("@krishna/core/tools/job-apply");
    const result = await getJobApplyTool.run({}, { vars: {} });

    expect(result.success).toBe(false);
    expect(result.output).toContain("can't reach your Chrome");
  });
});

// --- Allowlist entries present in Tauri configs ---

describe("Tauri allowlist entries for localhost:9222", () => {
  it("has http://localhost:9222/** in default.json", async () => {
    const fs = await import("fs");
    const content = JSON.parse(fs.readFileSync("src-tauri/capabilities/default.json", "utf-8"));
    const httpPerm = content.permissions.find((p: any) => p.identifier === "http:default");
    expect(httpPerm).toBeDefined();
    const urls = httpPerm.allow.map((a: any) => a.url);
    expect(urls).toContain("http://localhost:9222/**");
  });

  it("has http://localhost:9222/** in cross-platform.json", async () => {
    const fs = await import("fs");
    const content = JSON.parse(fs.readFileSync("src-tauri/capabilities/cross-platform.json", "utf-8"));
    const httpPerm = content.permissions.find((p: any) => p.identifier === "http:default");
    expect(httpPerm).toBeDefined();
    const urls = httpPerm.allow.map((a: any) => a.url);
    expect(urls).toContain("http://localhost:9222/**");
  });
});

// --- Parse job_apply action ---

describe("parseActions job_apply", () => {
  it("parses a job_apply action block", async () => {
    const { parseActions } = await import("@/lib/actions");
    const reply = 'Some text ```action\n{"action":"job_apply"}\n``` more text';
    const parsed = parseActions(reply);
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0].action).toBe("job_apply");
  });

  it("parses a job_apply json block", async () => {
    const { parseActions } = await import("@/lib/actions");
    const reply = 'Text ```json\n{"action":"job_apply"}\n```';
    const parsed = parseActions(reply);
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0].action).toBe("job_apply");
  });
});
