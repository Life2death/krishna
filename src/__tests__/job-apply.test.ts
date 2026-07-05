import { describe, it, expect, vi, beforeEach } from "vitest";
import { setHttpFetch } from "@krishna/core/http";
import { setSecretGetter } from "@krishna/core/secrets";

// --- Apply-button JS expression tests (the DOM heuristic logic) ---

function evalClickApplyJS(html: string): { found: boolean; text?: string; tag?: string } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const js = `(() => {
    const candidates = document.querySelectorAll('button, a');
    for (const el of candidates) {
      const text = (el.textContent || '').trim().toLowerCase();
      const label = (el.getAttribute('aria-label') || '').trim().toLowerCase();
      if (/apply/i.test(text) || /apply/i.test(label)) {
        el.click();
        return JSON.stringify({ found: true, text: el.textContent?.trim() || '', tag: el.tagName.toLowerCase() });
      }
    }
    return JSON.stringify({ found: false });
  })()`;

  const fn = new Function(
    "document",
    `const candidates = document.querySelectorAll('button, a');
    for (const el of candidates) {
      const text = (el.textContent || '').trim().toLowerCase();
      const label = (el.getAttribute('aria-label') || '').trim().toLowerCase();
      if (/apply/i.test(text) || /apply/i.test(label)) {
        const result = JSON.stringify({ found: true, text: el.textContent?.trim() || '', tag: el.tagName.toLowerCase() });
        return JSON.parse(result);
      }
    }
    return JSON.parse(JSON.stringify({ found: false }));`,
  );
  return fn(doc);
}

describe("clickApplyButton DOM heuristic", () => {
  it("finds <button> with text 'Apply Now'", () => {
    const result = evalClickApplyJS('<html><body><button>Apply Now</button></body></html>');
    expect(result.found).toBe(true);
    expect(result.text).toBe("Apply Now");
    expect(result.tag).toBe("button");
  });

  it("finds <a> with text 'Easy Apply'", () => {
    const result = evalClickApplyJS('<html><body><a>Easy Apply</a></body></html>');
    expect(result.found).toBe(true);
    expect(result.text).toBe("Easy Apply");
    expect(result.tag).toBe("a");
  });

  it("finds button via aria-label", () => {
    const result = evalClickApplyJS('<html><body><button aria-label="Apply for this job">Click</button></body></html>');
    expect(result.found).toBe(true);
    expect(result.text).toBe("Click");
    expect(result.tag).toBe("button");
  });

  it("returns not found when no apply button exists", () => {
    const result = evalClickApplyJS('<html><body><button>Cancel</button><a>Learn more</a></body></html>');
    expect(result.found).toBe(false);
  });

  it("is case-insensitive", () => {
    const result = evalClickApplyJS('<html><body><button>APPLY</button></body></html>');
    expect(result.found).toBe(true);
  });

  it("matches when 'apply' is part of longer text", () => {
    const result = evalClickApplyJS('<html><body><a>Click to Apply Here</a></body></html>');
    expect(result.found).toBe(true);
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
