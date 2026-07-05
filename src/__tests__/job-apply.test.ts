import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setHttpFetch } from "@krishna/core/http";
import { setSecretGetter } from "@krishna/core/secrets";

vi.mock("@krishna/core/database", async (importOriginal) => {
  const mod = await importOriginal();
  return { ...(mod as object), getMemoryByKey: vi.fn() };
});

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

// --- Field enumeration JS (J4-b) ---

let ENUMERATION_JS: string;

async function evalEnumJS(html: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!ENUMERATION_JS) {
    const mod = await import("@krishna/core/tools/field-fill");
    ENUMERATION_JS = mod.ENUMERATION_JS;
  }
  const fn = new Function("document", "return " + ENUMERATION_JS);
  return fn(doc);
}

function evalFillJS(html: string, fillJs: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const fn = new Function("document", "return " + fillJs);
  return fn(doc);
}

describe("form field enumeration JS (J4-b)", () => {
  it("finds input, select, and textarea fields", async () => {
    const raw = await evalEnumJS(`
      <html><body>
        <label for="name">Full Name</label>
        <input id="name" name="full_name" required />
        <label for="email">Email</label>
        <input id="email" type="email" />
        <label for="exp">Years of Experience</label>
        <select id="exp"><option>1</option></select>
        <textarea id="cover" placeholder="Cover letter"></textarea>
      </body></html>
    `);
    const fields = JSON.parse(raw);
    expect(fields).toHaveLength(4);
    expect(fields[0].name).toBe("full_name");
    expect(fields[0].required).toBe(true);
    expect(fields[1].type).toBe("email");
    expect(fields[2].tag).toBe("select");
    expect(fields[3].tag).toBe("textarea");
  });

  it("skips hidden, submit, button, and reset inputs", async () => {
    const raw = await evalEnumJS(`
      <html><body>
        <input type="hidden" name="csrf" />
        <input type="submit" value="Go" />
        <input type="button" value="Click" />
        <input type="reset" value="Clear" />
        <input type="text" name="real" />
      </body></html>
    `);
    const fields = JSON.parse(raw);
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("real");
  });

  it("resolves label via for, aria-label, closest label, and placeholder", async () => {
    const raw = await evalEnumJS(`
      <html><body>
        <label for="f1">First Name</label>
        <input id="f1" />
        <input aria-label="Email Address" id="f2" />
        <label>Phone<input name="phone" /></label>
        <input placeholder="City" name="city" />
      </body></html>
    `);
    const fields = JSON.parse(raw);
    expect(fields).toHaveLength(4);
    expect(fields[0].label).toBe("First Name");
    expect(fields[1].label).toBe("Email Address");
    expect(fields[2].label).toContain("Phone");
    expect(fields[3].placeholder).toBe("City");
  });
});

// --- Field-to-profile mapping (J4-b) ---

describe("mapFields pure function (J4-b)", () => {
  it("maps label-matched fields to profile keys", async () => {
    const { mapFields } = await import("@krishna/core/tools/field-fill");
    const fields = [
      { tag: "input", type: "text", name: "name", id: "", label: "Full Name", ariaLabel: "", placeholder: "", required: true, selector: "input[name='name']" },
      { tag: "input", type: "email", name: "email", id: "", label: "Email", ariaLabel: "", placeholder: "", required: true, selector: "input[name='email']" },
    ];
    const result = mapFields(fields, {
      fullName: "Vikram", email: "vik@test.com", phone: "",
      currentLocation: "", noticePeriod: "", currentCtc: "", expectedCtc: "",
      yearsOfExperience: "", resumePath: "", linkedInUrl: "", whyThisRole: "",
      relocationOk: false,
    });
    expect(result.filled).toHaveLength(2);
    expect(result.filled[0].profileKey).toBe("fullName");
    expect(result.filled[0].profileValue).toBe("Vikram");
    expect(result.filled[1].profileKey).toBe("email");
  });

  it("matches fields by aria-label", async () => {
    const { mapFields } = await import("@krishna/core/tools/field-fill");
    const fields = [
      { tag: "input", type: "text", name: "", id: "", label: "", ariaLabel: "Phone Number", placeholder: "", required: true, selector: "input" },
    ];
    const result = mapFields(fields, {
      fullName: "", email: "", phone: "9999999999",
      currentLocation: "", noticePeriod: "", currentCtc: "", expectedCtc: "",
      yearsOfExperience: "", resumePath: "", linkedInUrl: "", whyThisRole: "",
      relocationOk: false,
    });
    expect(result.filled).toHaveLength(1);
    expect(result.filled[0].profileKey).toBe("phone");
  });

  it("matches fields by placeholder", async () => {
    const { mapFields } = await import("@krishna/core/tools/field-fill");
    const fields = [
      { tag: "input", type: "text", name: "", id: "", label: "", ariaLabel: "", placeholder: "LinkedIn URL", required: false, selector: "input" },
    ];
    const result = mapFields(fields, {
      fullName: "", email: "", phone: "", currentLocation: "", noticePeriod: "",
      currentCtc: "", expectedCtc: "", yearsOfExperience: "", resumePath: "",
      linkedInUrl: "https://linkedin.com/in/vikram", whyThisRole: "",
      relocationOk: false,
    });
    expect(result.filled).toHaveLength(1);
    expect(result.filled[0].profileKey).toBe("linkedInUrl");
  });

  it("collects unmapped required fields", async () => {
    const { mapFields } = await import("@krishna/core/tools/field-fill");
    const fields = [
      { tag: "input", type: "text", name: "name", id: "", label: "Full Name", ariaLabel: "", placeholder: "", required: true, selector: "input[name='name']" },
      { tag: "input", type: "text", name: "exp", id: "", label: "Years of Experience", ariaLabel: "", placeholder: "", required: true, selector: "input[name='exp']" },
    ];
    const result = mapFields(fields, {
      fullName: "Vikram", email: "", phone: "", currentLocation: "", noticePeriod: "",
      currentCtc: "", expectedCtc: "", yearsOfExperience: "", resumePath: "",
      linkedInUrl: "", whyThisRole: "", relocationOk: false,
    });
    expect(result.filled).toHaveLength(1);
    expect(result.unmappedRequired.length).toBeGreaterThan(0);
    const expField = result.unmappedRequired.find((f) => f.name === "exp");
    expect(expField).toBeDefined();
  });

  it("skips file inputs in mapping but reports fileInputFound", async () => {
    const { mapFields } = await import("@krishna/core/tools/field-fill");
    const fields = [
      { tag: "input", type: "file", name: "resume", id: "", label: "Upload Resume", ariaLabel: "", placeholder: "", required: true, selector: "input[name='resume']" },
    ];
    const result = mapFields(fields, {
      fullName: "", email: "", phone: "", currentLocation: "", noticePeriod: "",
      currentCtc: "", expectedCtc: "", yearsOfExperience: "", resumePath: "/tmp/resume.pdf",
      linkedInUrl: "", whyThisRole: "", relocationOk: false,
    });
    expect(result.filled).toHaveLength(0);
    expect(result.fileInputFound).toBe(true);
  });
});

// --- FilledSummary helper (J4-b) ---

describe("filledSummary (J4-b)", () => {
  it("formats a summary with filled and unmapped counts", async () => {
    const { filledSummary } = await import("@krishna/core/tools/field-fill");
    const result = {
      filled: [
        { field: null as any, profileKey: "fullName", profileValue: "V", displayName: "Full name" },
        { field: null as any, profileKey: "email", profileValue: "v@t.com", displayName: "Email" },
      ],
      unmappedRequired: [
        { tag: "input", type: "text", name: "exp", id: "", label: "Years of Experience", ariaLabel: "", placeholder: "", required: true, selector: "input" },
      ],
      fileInputFound: false,
    };
    const s = filledSummary(result);
    expect(s).toContain("filled 2 fields");
    expect(s).toContain("could not map 1 required field");
    expect(s).toContain("Years of Experience");
  });

  it("mentions file input when found", async () => {
    const { filledSummary } = await import("@krishna/core/tools/field-fill");
    const result = {
      filled: [],
      unmappedRequired: [],
      fileInputFound: true,
    };
    const s = filledSummary(result);
    expect(s).toContain("filled 0 fields");
    expect(s).toContain("found a file-upload field");
  });
});

// --- Fill JS execution against fixture DOM (J4-b) ---

describe("makeFillJs execution (J4-b)", () => {
  it("fills an input value and dispatches events", async () => {
    const { makeFillJs } = await import("@krishna/core/tools/field-fill");
    const fillJs = makeFillJs([
      { field: { tag: "input", type: "text", name: "", id: "name", label: "Name", ariaLabel: "", placeholder: "", required: false, selector: "#name" }, profileKey: "fullName", profileValue: "Vikram", displayName: "Full name" },
    ]);
    const raw = evalFillJS('<html><body><input id="name" /></body></html>', fillJs);
    const results = JSON.parse(raw);
    expect(results["#name"]).toBe(true);
    const doc = new DOMParser().parseFromString('<html><body><input id="name" /></body></html>', "text/html");
    const fn = new Function("document", "return " + fillJs);
    fn(doc);
    expect((doc.getElementById("name") as HTMLInputElement).value).toBe("Vikram");
  });

  it("selects a matching option in a select element", async () => {
    const { makeFillJs } = await import("@krishna/core/tools/field-fill");
    const fillJs = makeFillJs([
      { field: { tag: "select", type: "select-one", name: "", id: "exp", label: "Experience", ariaLabel: "", placeholder: "", required: false, selector: "#exp" }, profileKey: "yearsOfExperience", profileValue: "5 years", displayName: "Years of experience" },
    ]);
    const doc = new DOMParser().parseFromString('<html><body><select id="exp"><option value="">Select</option><option value="5">5 years</option></select></body></html>', "text/html");
    const fn = new Function("document", "return " + fillJs);
    fn(doc);
    expect((doc.getElementById("exp") as HTMLSelectElement).value).toBe("5");
  });
});

// --- Real-path CDP evaluate for fillForm (J4-b) ---

describe("fillForm CDP evaluate path (J4-b)", () => {
  beforeEach(() => {
    setSecretGetter(async () => "test-token");
  });

  it("enumerates, maps, and fills fields via mocked send", async () => {
    const { CdpClient } = await import("@krishna/core/tools/cdp-client");
    const client = new CdpClient();
    const enumResult = JSON.stringify([
      { tag: "input", type: "text", name: "name", id: "", label: "Full Name", ariaLabel: "", placeholder: "", required: true, selector: "input[name='name']" },
    ]);
    client.send = vi.fn()
      .mockResolvedValueOnce({ result: { type: "string", value: enumResult } })
      .mockResolvedValueOnce({ result: { type: "string", value: JSON.stringify({ "input[name='name']": true }) } });

    const { fillForm } = await import("@krishna/core/tools/field-fill");
    const result = await fillForm(client, {
      fullName: "Vikram", email: "", phone: "", currentLocation: "", noticePeriod: "",
      currentCtc: "", expectedCtc: "", yearsOfExperience: "", resumePath: "",
      linkedInUrl: "", whyThisRole: "", relocationOk: false,
    });

    expect(result.filled).toHaveLength(1);
    expect(result.filled[0].profileKey).toBe("fullName");
    expect(result.filled[0].profileValue).toBe("Vikram");
  });
});

// --- Profile loading from memory store (JB-1) ---

describe("getJobApplyTool profile loading (JB-1)", () => {
  const PROFILE_JSON = JSON.stringify({
    fullName: "Vikram", email: "vik@t.com", phone: "9999999999",
    currentLocation: "Bangalore", noticePeriod: "30 days", currentCtc: "1200000",
    expectedCtc: "1800000", yearsOfExperience: "5", resumePath: "",
    linkedInUrl: "https://linkedin.com/in/vikram", whyThisRole: "",
    relocationOk: false,
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    setSecretGetter(async () => "test-token");

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("job-hunter-x5l1")) {
        return {
          ok: true, status: 200,
          json: async () => ({
            rows: [{ job_id: "j1", title: "Engineer", company: "Acme", url: "https://linkedin.com/apply/123", portal: "LinkedIn" }],
            total: 1,
          }),
        };
      }
      if (url.includes("localhost:9222/json")) {
        return {
          ok: true, status: 200,
          json: async () => [{ id: "1", title: "Test", url: "https://example.com", webSocketDebuggerUrl: "ws://localhost:9222/1", type: "page" }],
        };
      }
      throw new Error("unexpected URL");
    });
    setHttpFetch(mockFetch as any);

    const { CdpClient } = await import("@krishna/core/tools/cdp-client");
    vi.spyOn(CdpClient.prototype, "listTargets").mockResolvedValue([
      { id: "1", title: "Test", url: "https://example.com", webSocketDebuggerUrl: "ws://localhost:9222/1", type: "page" },
    ]);
    vi.spyOn(CdpClient.prototype, "connect").mockResolvedValue(undefined);
    vi.spyOn(CdpClient.prototype, "navigate").mockResolvedValue(undefined);
    vi.spyOn(CdpClient.prototype, "clickApplyButton").mockResolvedValue({
      found: true, clicked: true, text: "Easy Apply", tag: "button",
    });
    vi.spyOn(CdpClient.prototype, "evaluate")
      .mockResolvedValueOnce("[]")
      .mockResolvedValueOnce("{}");
    vi.spyOn(CdpClient.prototype, "disconnect").mockResolvedValue(undefined);
  });

  it("loads profile from memory store and fills fields", async () => {
    const { getMemoryByKey } = await import("@krishna/core/database");
    vi.mocked(getMemoryByKey).mockResolvedValue({
      id: "m1", key: "application_profile", value: PROFILE_JSON,
      source: "user", confirmed: 1, createdAt: 0, lastUsedAt: null,
    });

    const { getJobApplyTool } = await import("@krishna/core/tools/job-apply");
    const result = await getJobApplyTool.run({}, { vars: {} });

    expect(result.success).toBe(true);
    expect(result.output).toContain("filled");
  });

  it("says no profile when memory store returns null", async () => {
    const { getMemoryByKey } = await import("@krishna/core/database");
    vi.mocked(getMemoryByKey).mockResolvedValue(null);

    const { getJobApplyTool } = await import("@krishna/core/tools/job-apply");
    const result = await getJobApplyTool.run({}, { vars: {} });

    expect(result.success).toBe(true);
    expect(result.output).toContain("don't have your application profile yet");
  });
});

// --- Submit-button DOM heuristic (J4-c) ---

function evalSubmitJS(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const fn = new Function(
    "document",
    `const candidates = document.querySelectorAll('button, input[type=submit], input[type=button]');
    for (const el of candidates) {
      const tag = el.tagName.toLowerCase();
      const text = tag === 'input' ? (el.value || '').trim() : (el.textContent || '').trim();
      const label = (el.getAttribute('aria-label') || '').trim();
      const type = el.getAttribute('type') || '';
      if (!text && !label) continue;
      if (/cancel|back|previous/i.test(text) || /cancel|back|previous/i.test(label)) continue;
      if (type === 'submit' || /submit|send application|apply now|next|continue|done/i.test(text) || /submit|send application|apply now|next|continue|done/i.test(label)) {
        return JSON.stringify({ found: true, clicked: true, text: text || label, tag: tag });
      }
    }
    return JSON.stringify({ found: false });`,
  );
  return fn(doc);
}

describe("clickSubmitButton DOM heuristic (J4-c)", () => {
  it("finds and clicks a Submit button by type=submit", () => {
    const result = JSON.parse(evalSubmitJS('<html><body><button type="submit">Submit</button></body></html>'));
    expect(result.found).toBe(true);
    expect(result.clicked).toBe(true);
    expect(result.text).toBe("Submit");
    expect(result.tag).toBe("button");
  });

  it("finds and clicks input[type=submit]", () => {
    const result = JSON.parse(evalSubmitJS('<html><body><input type="submit" value="Apply Now" /></body></html>'));
    expect(result.found).toBe(true);
    expect(result.clicked).toBe(true);
    expect(result.tag).toBe("input");
  });

  it("matches button with text 'Send Application'", () => {
    const result = JSON.parse(evalSubmitJS('<html><body><button>Send Application</button></body></html>'));
    expect(result.found).toBe(true);
    expect(result.clicked).toBe(true);
  });

  it("matches 'Next' or 'Continue' for multi-step forms", () => {
    const next = JSON.parse(evalSubmitJS('<html><body><button>Next</button></body></html>'));
    expect(next.found).toBe(true);
    const cont = JSON.parse(evalSubmitJS('<html><body><button>Continue</button></body></html>'));
    expect(cont.found).toBe(true);
    const done = JSON.parse(evalSubmitJS('<html><body><button>Done</button></body></html>'));
    expect(done.found).toBe(true);
  });

  it("does not match Cancel, Back, or Previous buttons", () => {
    const cancel = JSON.parse(evalSubmitJS('<html><body><button>Cancel</button></body></html>'));
    expect(cancel.found).toBe(false);
    const back = JSON.parse(evalSubmitJS('<html><body><button>Back</button></body></html>'));
    expect(back.found).toBe(false);
    const prev = JSON.parse(evalSubmitJS('<html><body><button>Previous</button></body></html>'));
    expect(prev.found).toBe(false);
  });

  it("returns not found when no submit-related element exists", () => {
    const result = JSON.parse(evalSubmitJS('<html><body><button>Click me</button><a>Learn more</a></body></html>'));
    expect(result.found).toBe(false);
  });

  it("matches by aria-label for submit-like labels", () => {
    const result = JSON.parse(evalSubmitJS('<html><body><button aria-label="Submit Application">x</button></body></html>'));
    expect(result.found).toBe(true);
    expect(result.clicked).toBe(true);
  });

  it("excludes elements with no text and no label", () => {
    const result = JSON.parse(evalSubmitJS('<html><body><button></button></body></html>'));
    expect(result.found).toBe(false);
  });
});

// --- Submission-verification DOM heuristic (J4-c) ---

function evalVerificationJS(bodyText: string): string {
  const html = `<html><body>${bodyText}</body></html>`;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.documentElement;
  const text = root ? root.textContent || '' : bodyText;
  const success = /application sent|application submitted|thank you|applied successfully|your application has been|submitted successfully|we've received your application/i.test(text);
  return JSON.stringify({ success: success, signal: success ? "confirmation text found" : "no clear confirmation" });
}

describe("verifySubmission regex patterns (J4-c)", () => {
  it("detects 'application sent' text as success", () => {
    const result = JSON.parse(evalVerificationJS("Your application has been sent"));
    expect(result.success).toBe(true);
    expect(result.signal).toBe("confirmation text found");
  });

  it("detects 'application submitted' text as success", () => {
    const result = JSON.parse(evalVerificationJS("Application submitted successfully"));
    expect(result.success).toBe(true);
  });

  it("detects 'thank you' text as success", () => {
    const result = JSON.parse(evalVerificationJS("Thank you for your application"));
    expect(result.success).toBe(true);
  });

  it("detects 'applied successfully' as success", () => {
    const result = JSON.parse(evalVerificationJS("You have applied successfully"));
    expect(result.success).toBe(true);
  });

  it("returns no success for unrelated page text", () => {
    const result = JSON.parse(evalVerificationJS("Some random page content here"));
    expect(result.success).toBe(false);
    expect(result.signal).toBe("no clear confirmation");
  });
});

// --- CDP evaluate path for clickSubmitButton (J4-c) ---

describe("CdpClient.clickSubmitButton CDP evaluate path (J4-c)", () => {
  beforeEach(() => {
    setSecretGetter(async () => "test-token");
  });

  it("calls evaluate with submit-js and parses the result", async () => {
    const { CdpClient } = await import("@krishna/core/tools/cdp-client");
    const client = new CdpClient();
    client.evaluate = vi.fn().mockResolvedValue(JSON.stringify({ found: true, clicked: true, text: "Submit", tag: "button" }));

    const result = await client.clickSubmitButton();
    expect(result.found).toBe(true);
    expect(result.clicked).toBe(true);
    expect(result.text).toBe("Submit");
  });

  it("returns not found when no submit button exists", async () => {
    const { CdpClient } = await import("@krishna/core/tools/cdp-client");
    const client = new CdpClient();
    client.evaluate = vi.fn().mockResolvedValue(JSON.stringify({ found: false }));

    const result = await client.clickSubmitButton();
    expect(result.found).toBe(false);
  });
});

// --- CDP evaluate path for verifySubmission (J4-c) ---

describe("CdpClient.verifySubmission CDP evaluate path (J4-c)", () => {
  beforeEach(() => {
    setSecretGetter(async () => "test-token");
  });

  it("returns success true when confirmation text is found", async () => {
    const { CdpClient } = await import("@krishna/core/tools/cdp-client");
    const client = new CdpClient();
    client.evaluate = vi.fn().mockResolvedValue(JSON.stringify({ success: true, signal: "confirmation text found", url: "https://linkedin.com/jobs/123" }));

    const result = await client.verifySubmission();
    expect(result.success).toBe(true);
    expect(result.signal).toBe("confirmation text found");
  });

  it("returns success false when no confirmation text", async () => {
    const { CdpClient } = await import("@krishna/core/tools/cdp-client");
    const client = new CdpClient();
    client.evaluate = vi.fn().mockResolvedValue(JSON.stringify({ success: false, signal: "no clear confirmation", url: "https://linkedin.com/jobs/123" }));

    const result = await client.verifySubmission();
    expect(result.success).toBe(false);
    expect(result.signal).toBe("no clear confirmation");
  });
});

// --- getJobApplySubmitTool graceful error / submit flow ---

describe("getJobApplySubmitTool (J4-c)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSecretGetter(async () => "test-token");
  });

  it("returns submit declined when user does not confirm", async () => {
    const { setVerbatimConfirm } = await import("@krishna/core/tools/mcp-bridge");
    setVerbatimConfirm(() => Promise.resolve(false));

    const { getJobApplySubmitTool } = await import("@krishna/core/tools/job-apply-submit");
    const result = await getJobApplySubmitTool.run(
      { url: "https://linkedin.com/apply/123", jobId: "j1", title: "Engineer", company: "Acme" },
      { vars: {} },
    );

    expect(result.success).toBe(false);
    expect(result.output).toContain("declined");
  });

  it("skips confirmation when preConfirmed is true", async () => {
    const confirmSpy = vi.fn();
    const { setVerbatimConfirm } = await import("@krishna/core/tools/mcp-bridge");
    setVerbatimConfirm(confirmSpy);

    const { CdpClient } = await import("@krishna/core/tools/cdp-client");
    vi.spyOn(CdpClient.prototype, "listTargets").mockResolvedValue([
      { id: "1", title: "LinkedIn", url: "https://linkedin.com/apply/123", webSocketDebuggerUrl: "ws://localhost:9222/1", type: "page" },
    ]);
    vi.spyOn(CdpClient.prototype, "connect").mockResolvedValue(undefined);
    vi.spyOn(CdpClient.prototype, "clickSubmitButton").mockResolvedValue({
      found: true, clicked: true, text: "Submit", tag: "button",
    });
    vi.spyOn(CdpClient.prototype, "verifySubmission").mockResolvedValue({
      success: true, signal: "confirmation text found", url: "https://linkedin.com/apply/123",
    });
    vi.spyOn(CdpClient.prototype, "disconnect").mockResolvedValue(undefined);

    const { getJobApplySubmitTool } = await import("@krishna/core/tools/job-apply-submit");
    const result = await getJobApplySubmitTool.run(
      { url: "https://linkedin.com/apply/123", jobId: "j1", title: "Engineer", company: "Acme" },
      { vars: {}, preConfirmed: true },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("Submitted");
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("submits successfully and returns success output", async () => {
    const { setVerbatimConfirm } = await import("@krishna/core/tools/mcp-bridge");
    setVerbatimConfirm(() => Promise.resolve(true));

    const { CdpClient } = await import("@krishna/core/tools/cdp-client");
    vi.spyOn(CdpClient.prototype, "listTargets").mockResolvedValue([
      { id: "1", title: "LinkedIn", url: "https://linkedin.com/apply/123", webSocketDebuggerUrl: "ws://localhost:9222/1", type: "page" },
    ]);
    vi.spyOn(CdpClient.prototype, "connect").mockResolvedValue(undefined);
    vi.spyOn(CdpClient.prototype, "clickSubmitButton").mockResolvedValue({
      found: true, clicked: true, text: "Submit", tag: "button",
    });
    vi.spyOn(CdpClient.prototype, "verifySubmission").mockResolvedValue({
      success: true, signal: "confirmation text found", url: "https://linkedin.com/apply/123",
    });
    vi.spyOn(CdpClient.prototype, "disconnect").mockResolvedValue(undefined);

    const httpFetch = vi.fn().mockResolvedValue({ ok: true });
    setHttpFetch(httpFetch as any);

    const { getJobApplySubmitTool } = await import("@krishna/core/tools/job-apply-submit");
    const result = await getJobApplySubmitTool.run(
      { url: "https://linkedin.com/apply/123", jobId: "j1", title: "Engineer", company: "Acme" },
      { vars: {} },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("Submitted");
    expect(result.output).toContain("Engineer");
    expect(result.output).toContain("Acme");
  });

  it("reports ambiguous verification when no confirmation text", async () => {
    const { setVerbatimConfirm } = await import("@krishna/core/tools/mcp-bridge");
    setVerbatimConfirm(() => Promise.resolve(true));

    const { CdpClient } = await import("@krishna/core/tools/cdp-client");
    vi.spyOn(CdpClient.prototype, "listTargets").mockResolvedValue([
      { id: "1", title: "LinkedIn", url: "https://linkedin.com/apply/123", webSocketDebuggerUrl: "ws://localhost:9222/1", type: "page" },
    ]);
    vi.spyOn(CdpClient.prototype, "connect").mockResolvedValue(undefined);
    vi.spyOn(CdpClient.prototype, "clickSubmitButton").mockResolvedValue({
      found: true, clicked: true, text: "Submit", tag: "button",
    });
    vi.spyOn(CdpClient.prototype, "verifySubmission").mockResolvedValue({
      success: false, signal: "no clear confirmation", url: "https://linkedin.com/apply/123",
    });
    vi.spyOn(CdpClient.prototype, "disconnect").mockResolvedValue(undefined);

    const { getJobApplySubmitTool } = await import("@krishna/core/tools/job-apply-submit");
    const result = await getJobApplySubmitTool.run(
      { url: "https://linkedin.com/apply/123", jobId: "j1", title: "Engineer", company: "Acme" },
      { vars: {} },
    );

    expect(result.success).toBe(true);
    expect(result.output).toContain("not certain");
    expect(result.data?.status).toBe("submitted_ambiguous");
  });

  it("returns friendly message when submit button not found", async () => {
    const { setVerbatimConfirm } = await import("@krishna/core/tools/mcp-bridge");
    setVerbatimConfirm(() => Promise.resolve(true));

    const { CdpClient } = await import("@krishna/core/tools/cdp-client");
    vi.spyOn(CdpClient.prototype, "listTargets").mockResolvedValue([
      { id: "1", title: "LinkedIn", url: "https://linkedin.com/apply/123", webSocketDebuggerUrl: "ws://localhost:9222/1", type: "page" },
    ]);
    vi.spyOn(CdpClient.prototype, "connect").mockResolvedValue(undefined);
    vi.spyOn(CdpClient.prototype, "clickSubmitButton").mockResolvedValue({
      found: false,
    });
    vi.spyOn(CdpClient.prototype, "disconnect").mockResolvedValue(undefined);

    const { getJobApplySubmitTool } = await import("@krishna/core/tools/job-apply-submit");
    const result = await getJobApplySubmitTool.run(
      { url: "https://linkedin.com/apply/123", jobId: "j1", title: "Engineer", company: "Acme" },
      { vars: {} },
    );

    expect(result.success).toBe(false);
    expect(result.output).toContain("couldn't find the Submit button");
  });

  it("returns friendly message when Chrome not reachable", async () => {
    const { setVerbatimConfirm } = await import("@krishna/core/tools/mcp-bridge");
    setVerbatimConfirm(() => Promise.resolve(true));

    const { CdpClient } = await import("@krishna/core/tools/cdp-client");
    vi.spyOn(CdpClient.prototype, "listTargets").mockResolvedValue([]);

    const { getJobApplySubmitTool } = await import("@krishna/core/tools/job-apply-submit");
    const result = await getJobApplySubmitTool.run(
      { url: "https://linkedin.com/apply/123", jobId: "j1", title: "Engineer", company: "Acme" },
      { vars: {} },
    );

    expect(result.success).toBe(false);
    expect(result.output).toContain("can't reach your Chrome");
  });
});

// --- Parse job_apply_submit action ---

describe("parseActions job_apply_submit", () => {
  it("parses a job_apply_submit action block", async () => {
    const { parseActions } = await import("@/lib/actions");
    const reply = 'Text ```action\n{"action":"job_apply_submit","url":"https://linkedin.com/apply/123","jobId":"j1","title":"Engineer","company":"Acme"}\n```';
    const parsed = parseActions(reply);
    expect(parsed.actions).toHaveLength(1);
    const action = parsed.actions[0];
    if (action.action === "job_apply_submit") {
      expect(action.url).toBe("https://linkedin.com/apply/123");
      expect(action.jobId).toBe("j1");
      expect(action.title).toBe("Engineer");
      expect(action.company).toBe("Acme");
    } else {
      expect(action.action).toBe("job_apply_submit");
    }
  });
});
