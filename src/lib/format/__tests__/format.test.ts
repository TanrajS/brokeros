import { describe, expect, it } from "vitest";
import { formatMonth, formatRate, formatRatioPercent, formatSignedPercent } from "../index";

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


describe("formatRatioPercent and formatMonth", () => {
  it("formats ratios to one decimal", () => {
    expect(formatRatioPercent(0.875)).toBe("87.5%"); // 0.875 × 100 = 87.5
    expect(formatRatioPercent(0.8)).toBe("80.0%");
    expect(formatRatioPercent(1.0546)).toBe("105.5%");
    expect(formatRatioPercent(null)).toBeNull();
    expect(formatRatioPercent(NaN)).toBeNull();
  });
  it("names months", () => {
    expect(formatMonth("2026-12")).toBe("December 2026");
    expect(formatMonth("2026-13")).toBeNull();
    expect(formatMonth("")).toBeNull();
  });
});
