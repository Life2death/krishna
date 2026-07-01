import { describe, it, expect, beforeEach } from "vitest";
import { setSpokenUrlNames, urlToSpokenName, sanitizeSpeech } from "@/lib/speech-sanitize";

// Reset the module state between tests
beforeEach(() => {
  setSpokenUrlNames([], []);
});

describe("setSpokenUrlNames + urlToSpokenName", () => {
  it("ignores unconfirmed memories", () => {
    setSpokenUrlNames([
      { key: "my site", value: "https://example.com", confirmed: false },
    ]);
    expect(urlToSpokenName("https://example.com")).toBe("example");
  });

  it("ignores key-less memories", () => {
    setSpokenUrlNames([
      { key: null, value: "https://example.com", confirmed: true },
    ]);
    expect(urlToSpokenName("https://example.com")).toBe("example");
  });

  it("ignores non-URL memories", () => {
    setSpokenUrlNames([
      { key: "password", value: "hunter2", confirmed: true },
    ]);
    expect(urlToSpokenName("https://example.com")).toBe("example");
  });

  it("uses friendly name from memory (full host+path match)", () => {
    setSpokenUrlNames([
      { key: "job dashboard", value: "https://job-hunter-x5l1.onrender.com/", confirmed: true },
    ]);
    expect(urlToSpokenName("https://job-hunter-x5l1.onrender.com/")).toBe("job dashboard");
  });

  it("falls back to host-only match when path differs", () => {
    setSpokenUrlNames([
      { key: "job dashboard", value: "https://job-hunter-x5l1.onrender.com/", confirmed: true },
    ]);
    expect(urlToSpokenName("https://job-hunter-x5l1.onrender.com/list")).toBe("job dashboard");
  });

  it("returns SLD for unknown URL", () => {
    expect(urlToSpokenName("https://www.google.com/search?q=latest+news")).toBe("google");
  });

  it("handles bare hostname without scheme (3+ labels needed for parse)", () => {
    expect(urlToSpokenName("www.youtube.com/watch?v=abc")).toBe("youtube");
  });

  it("handles 2-part TLD co.in", () => {
    expect(urlToSpokenName("shop.example.co.in/cart")).toBe("example");
  });

  it("returns 'a link' for single-label host", () => {
    expect(urlToSpokenName("localhost:3000")).toBe("a link");
  });

  it("cleans noise words from memory key", () => {
    setSpokenUrlNames([
      { key: "jobs url", value: "https://jobs.example.com/", confirmed: true },
    ]);
    expect(urlToSpokenName("https://jobs.example.com/")).toBe("jobs");
  });
});

describe("sanitizeSpeech", () => {
  it("replaces URL with friendly name when memory set", () => {
    setSpokenUrlNames([
      { key: "job dashboard", value: "https://job-hunter-x5l1.onrender.com/", confirmed: true },
    ]);
    const result = sanitizeSpeech("I can open it: https://job-hunter-x5l1.onrender.com/");
    expect(result).toBe("I can open it: job dashboard");
  });

  it("replaces URL with SLD when no memory", () => {
    const result = sanitizeSpeech("I can search for you: https://www.google.com/search?q=latest+news");
    expect(result).not.toContain("http");
    expect(result).not.toContain("?");
    expect(result).not.toContain("q=");
    expect(result).toContain("google");
  });

  it("replaces bare 3-label hostname with SLD", () => {
    const result = sanitizeSpeech("check www.youtube.com/watch?v=abc");
    expect(result).toContain("youtube");
    expect(result).not.toContain("www.youtube.com");
  });

  it("replaces bare multi-label host with SLD", () => {
    const result = sanitizeSpeech("your store at shop.example.co.in/cart");
    expect(result).toContain("example");
  });

  it("keeps markdown link text, strips URL", () => {
    const result = sanitizeSpeech("See [the docs](https://x.com/y)");
    expect(result).toBe("See the docs");
  });

  it("leaves non-URL text unchanged", () => {
    const result = sanitizeSpeech("I prefer Node.js for that");
    expect(result).toBe("I prefer Node.js for that");
  });

  it("leaves single-label host with port unchanged (regex requires ≥3 labels)", () => {
    const result = sanitizeSpeech("check localhost:3000");
    expect(result).toBe("check localhost:3000");
  });

  it("cleans action blocks", () => {
    const result = sanitizeSpeech("Hello\n```action\n{\"type\":\"open\"}\n```\nworld");
    expect(result).toMatch(/^Hello\s+world$/);
  });
});
