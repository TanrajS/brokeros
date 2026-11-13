import { describe, expect, it } from "vitest";
import { formatRate, formatSignedPercent } from "../index";

describe("formatSignedPercent", () => {
  it("signs and rounds to one decimal", () => {
    expect(formatSignedPercent(0.08)).toBe("+8.0%"); // 0.08 × 100 = 8.0
    expect(formatSignedPercent(-0.06087)).toBe("−6.1%"); // −6.087 → 6.1
    expect(formatSignedPercent(0.00001)).toBe("0.0%"); // rounds to zero, no sign
    expect(formatSignedPercent(null)).toBeNull();
  });
});

describe("formatRate", () => {
  it("shows dollars and cents", () => {
    expect(formatRate(4.695652)).toBe("$4.70");
    expect(formatRate(undefined)).toBeNull();
  });
});
