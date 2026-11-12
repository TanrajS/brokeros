import { describe, expect, it } from "vitest";
import { toCsv } from "../csv";

describe("toCsv", () => {
  it("quotes commas, quotes and newlines, and blanks nulls", () => {
    const out = toCsv(["a", "b"], [["x,y", 'say "hi"'], [null, "line\nbreak"], [12.5, true]]);
    expect(out).toBe('a,b\r\n"x,y","say ""hi"""\r\n,"line\nbreak"\r\n12.5,true\r\n');
  });
  it("neutralises formula-looking cells", () => {
    expect(toCsv(["a"], [["=SUM(1)"]])).toBe("a\r\n\"'=SUM(1)\"\r\n");
  });
});
