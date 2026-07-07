import { describe, it, expect } from "vitest";
import { SentenceStream, isInsideFence, stripActionFences } from "@/lib/sentence-stream";

describe("SentenceStream", () => {
  it("emits complete sentences from a single chunk", () => {
    const s = new SentenceStream();
    const result = s.addChunk("Hello. How are you? I am fine.");
    expect(result).toEqual(["Hello.", "How are you?"]);
    expect(s.flush()).toEqual(["I am fine."]);
  });

  it("emits nothing for incomplete sentence", () => {
    const s = new SentenceStream();
    const result = s.addChunk("Hello, how are");
    expect(result).toEqual([]);
  });

  it("accumulates across chunks and emits when boundary arrives", () => {
    const s = new SentenceStream();
    expect(s.addChunk("Hello")).toEqual([]);
    expect(s.addChunk(". How are you?")).toEqual(["Hello.", "How are you?"]);
  });

  it("handles Hindi danda as sentence boundary", () => {
    const s = new SentenceStream();
    const result = s.addChunk("\u0928\u092e\u0938\u094d\u0924\u0947\u0964 \u0906\u092a \u0915\u0948\u0938\u0947 \u0939\u0948\u0902\u0964");
    expect(result).toEqual([
      "\u0928\u092e\u0938\u094d\u0924\u0947\u0964",
      "\u0906\u092a \u0915\u0948\u0938\u0947 \u0939\u0948\u0902\u0964",
    ]);
  });

  it("does not split on known abbreviations", () => {
    const s = new SentenceStream();
    s.addChunk("Dr. Smith and Mr. Jones went to St. Louis.");
    expect(s.flush()).toEqual(["Dr. Smith and Mr. Jones went to St. Louis."]);
  });

  it("does not split on single-letter initials", () => {
    const s = new SentenceStream();
    s.addChunk("A. Smith met B. Jones at the office.");
    expect(s.flush()).toEqual(["A. Smith met B. Jones at the office."]);
  });

  it("does not split on decimal numbers", () => {
    const s = new SentenceStream();
    expect(s.addChunk("The score is 3.5 out of 5. That is good.")).toEqual(["The score is 3.5 out of 5."]);
    expect(s.flush()).toEqual(["That is good."]);
  });

  it("does not split on decimal across chunks (chunk boundary after period)", () => {
    const s = new SentenceStream();
    expect(s.addChunk("The time is 3.")).toEqual([]);
    s.addChunk("5pm sharp.");
    expect(s.flush()).toEqual(["The time is 3.5pm sharp."]);
  });

  it("flush resolves a trailing period at stream end", () => {
    const s = new SentenceStream();
    s.addChunk("The time is 3.5pm.");
    expect(s.flush()).toEqual(["The time is 3.5pm."]);
  });

  it("does not emit inside fences (single chunk)", () => {
    const s = new SentenceStream();
    const result = s.addChunk("Let me check. ```action\n{ \"tool\": \"test\" }\n``` Done.");
    expect(result).toEqual(["Let me check."]);
    expect(s.flush()).toEqual(["Done."]);
  });

  it("does not emit inside fences split across chunks", () => {
    const s = new SentenceStream();
    expect(s.addChunk("Hello. ```action\n{ \"tool\": \"tes")).toEqual(["Hello."]);
    expect(s.addChunk("t\" }\n``` Bye now.")).toEqual([]);
    expect(s.flush()).toEqual(["Bye now."]);
  });

  it("flush returns partial sentence at end of stream", () => {
    const s = new SentenceStream();
    s.addChunk("Hello. How are you");
    const result = s.flush();
    expect(result).toEqual(["How are you"]);
  });

  it("flush returns empty when buffer is empty", () => {
    const s = new SentenceStream();
    s.addChunk("Done.");
    expect(s.flush()).toEqual(["Done."]);
    expect(s.flush()).toEqual([]);
  });

  it("flush returns empty when inside fence", () => {
    const s = new SentenceStream();
    s.addChunk("```action\n{ \"tool\": \"test\" }\n");
    expect(s.isInsideFence).toBe(true);
    const result = s.flush();
    expect(result).toEqual([]);
  });

  it("tracks fence state correctly", () => {
    const s = new SentenceStream();
    expect(s.isInsideFence).toBe(false);
    s.addChunk("Before. ```action\n{");
    expect(s.isInsideFence).toBe(true);
    s.addChunk("```");
    expect(s.isInsideFence).toBe(false);
    s.addChunk(" After.");
    expect(s.isInsideFence).toBe(false);
  });

  it("does not emit sentences while inside a fence that spans the entire chunk", () => {
    const s = new SentenceStream();
    const result = s.addChunk("```action\n{ \"tool\": \"test\" }. Even with period here. And here.\n```");
    expect(result).toEqual([]);
  });

  it("handles multiple punctuation marks at end", () => {
    const s = new SentenceStream();
    const result = s.addChunk("Really?! I don't believe it... Wait.");
    expect(result).toEqual(["Really?!", "I don't believe it..."]);
    expect(s.flush()).toEqual(["Wait."]);
  });
});

describe("isInsideFence", () => {
  it("returns false for text without fences", () => {
    expect(isInsideFence("Hello world")).toBe(false);
  });

  it("returns true for text with odd number of ```", () => {
    expect(isInsideFence("Some text ``` still open")).toBe(true);
  });

  it("returns false for text with even number of ```", () => {
    expect(isInsideFence("```closed```")).toBe(false);
  });
});

describe("stripActionFences", () => {
  it("removes fenced blocks", () => {
    const result = stripActionFences("Hello. ```action\n{ \"tool\": \"test\" }\n``` Done.");
    expect(result).toBe("Hello.  Done.");
  });

  it("removes multiple fenced blocks", () => {
    const result = stripActionFences("A. ```action\n{}\n``` B. ```json\n{}\n``` C.");
    expect(result).toBe("A.  B.  C.");
  });

  it("returns original text when no fences", () => {
    const result = stripActionFences("Hello world.");
    expect(result).toBe("Hello world.");
  });
});
