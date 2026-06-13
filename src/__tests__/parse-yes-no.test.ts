import { describe, it, expect } from "vitest";
import { parseYesNo } from "@/lib/parse-yes-no";

describe("parseYesNo", () => {
  it("returns 'yes' for common affirmatives", () => {
    expect(parseYesNo("yes")).toBe("yes");
    expect(parseYesNo("yeah")).toBe("yes");
    expect(parseYesNo("yep")).toBe("yes");
    expect(parseYesNo("sure")).toBe("yes");
    expect(parseYesNo("okay")).toBe("yes");
    expect(parseYesNo("ok")).toBe("yes");
    expect(parseYesNo("alright")).toBe("yes");
    expect(parseYesNo("go ahead")).toBe("yes");
    expect(parseYesNo("do it")).toBe("yes");
    expect(parseYesNo("please")).toBe("yes");
    expect(parseYesNo("yup")).toBe("yes");
    expect(parseYesNo("correct")).toBe("yes");
    expect(parseYesNo("right")).toBe("yes");
  });

  it("returns 'no' for common negatives", () => {
    expect(parseYesNo("no")).toBe("no");
    expect(parseYesNo("nope")).toBe("no");
    expect(parseYesNo("nah")).toBe("no");
    expect(parseYesNo("cancel")).toBe("no");
    expect(parseYesNo("stop")).toBe("no");
    expect(parseYesNo("dont")).toBe("no");
    expect(parseYesNo("don't")).toBe("no");
    expect(parseYesNo("not")).toBe("no");
    expect(parseYesNo("never")).toBe("no");
    expect(parseYesNo("forget it")).toBe("no");
    expect(parseYesNo("skip")).toBe("no");
    expect(parseYesNo("no thanks")).toBe("no");
  });

  it("handles punctuation and whitespace", () => {
    expect(parseYesNo("  yes! ")).toBe("yes");
    expect(parseYesNo("no?")).toBe("no");
    expect(parseYesNo("yeah.")).toBe("yes");
    expect(parseYesNo("  sure  ")).toBe("yes");
  });

  it("is case insensitive", () => {
    expect(parseYesNo("YES")).toBe("yes");
    expect(parseYesNo("No")).toBe("no");
    expect(parseYesNo("Yeah")).toBe("yes");
    expect(parseYesNo("Nope")).toBe("no");
  });

  it("returns 'ambiguous' for longer phrases that don't clearly match", () => {
    expect(parseYesNo("I think so")).toBe("ambiguous");
    expect(parseYesNo("maybe")).toBe("ambiguous");
    expect(parseYesNo("what did you say")).toBe("ambiguous");
    expect(parseYesNo("")).toBe("ambiguous");
  });

  it("returns 'yes' for short phrases containing yes word (≤3 words)", () => {
    expect(parseYesNo("yes please")).toBe("yes");
    expect(parseYesNo("sure thing")).toBe("yes");
    expect(parseYesNo("yeah that's fine")).toBe("yes");
  });

  it("returns 'no' for short phrases containing no word (≤3 words)", () => {
    expect(parseYesNo("no way")).toBe("no");
    expect(parseYesNo("not now")).toBe("no");
    expect(parseYesNo("nah man")).toBe("no");
  });
});
