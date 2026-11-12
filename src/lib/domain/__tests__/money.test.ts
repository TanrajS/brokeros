import { describe, expect, it } from "vitest";
import {
  commissionAmount,
  formatCompactDollars,
  formatLimit,
  parseCurrencyInput,
  sumAmounts,
} from "../money";

describe("formatCompactDollars", () => {
  it("formats millions, thousands and small amounts", () => {
    expect(formatCompactDollars(1_000_000).value).toBe("$1M"); // 1,000,000 ÷ 1,000,000 = 1
    expect(formatCompactDollars(2_500_000).value).toBe("$2.5M"); // 2,500,000 ÷ 1,000,000 = 2.5
    expect(formatCompactDollars(500_000).value).toBe("$500K"); // 500,000 ÷ 1,000 = 500
    expect(formatCompactDollars(25_000).value).toBe("$25K"); // 25,000 ÷ 1,000 = 25
    expect(formatCompactDollars(750).value).toBe("$750"); // below 1,000 → no unit
    expect(formatCompactDollars(0).value).toBe("$0");
  });
  it("keeps up to two decimals", () => {
    expect(formatCompactDollars(1_250_000).value).toBe("$1.25M"); // 1.25
    expect(formatCompactDollars(1_333_333).value).toBe("$1.33M"); // 1.333333 → 1.33
  });
  it("rejects negatives", () => {
    expect(() => formatCompactDollars(-1)).toThrow();
  });
});

describe("formatLimit", () => {
  it("produces the standard labels", () => {
    expect(formatLimit(1_000_000, 2_000_000).value).toBe("$1M / $2M");
    expect(formatLimit(500_000, 1_000_000).value).toBe("$500K / $1M");
    expect(formatLimit(2_500_000, 5_000_000).value).toBe("$2.5M / $5M");
  });
  it("marks a missing side with an em dash and names it", () => {
    const r = formatLimit(1_000_000, null);
    expect(r.value).toBe("$1M / —");
    expect(r.math.steps.missing).toEqual(["aggregate limit"]);
    expect(formatLimit(null, null).math.steps.missing).toEqual(["occurrence limit", "aggregate limit"]);
  });
});

describe("parseCurrencyInput", () => {
  it("accepts comma-grouped and plain numbers", () => {
    expect(parseCurrencyInput("48,000").value).toBe(48000);
    expect(parseCurrencyInput("48000").value).toBe(48000);
    expect(parseCurrencyInput("$48,000.50").value).toBe(48000.5);
    expect(parseCurrencyInput(" 1,234,567.89 ").value).toBe(1234567.89);
    expect(parseCurrencyInput("0").value).toBe(0);
  });
  it("rejects negatives", () => {
    const r = parseCurrencyInput("-5");
    expect(r.value).toBeNull();
    expect(r.error).toBe("Amount cannot be negative");
    expect(parseCurrencyInput("(5)").value).toBeNull();
  });
  it("rejects text and blanks", () => {
    expect(parseCurrencyInput("forty").value).toBeNull();
    expect(parseCurrencyInput("12abc").value).toBeNull();
    expect(parseCurrencyInput("1.2.3").value).toBeNull();
    expect(parseCurrencyInput("").error).toBe("Enter an amount");
  });
  it("shows the stripped intermediate", () => {
    expect(parseCurrencyInput("$1,000").math.steps.stripped).toBe("1000");
  });
});

describe("commissionAmount", () => {
  it("computes a whole-dollar commission", () => {
    // 108,000 × (15 ÷ 100) = 108,000 × 0.15 = 16,200
    const r = commissionAmount(108_000, 15);
    expect(r.value).toBe(16200);
    expect(r.math.steps.rateFraction).toBe(0.15);
    expect(r.math.steps.unrounded).toBe(16200);
  });
  it("computes with a fractional rate", () => {
    // 150,000 × 0.125 = 18,750
    expect(commissionAmount(150_000, 12.5).value).toBe(18750);
  });
  it("rounds to cents", () => {
    // 6,543.21 × 0.125 = 817.90125 → 817.90
    expect(commissionAmount(6543.21, 12.5).value).toBe(817.9);
  });
  it("handles zero", () => {
    expect(commissionAmount(0, 15).value).toBe(0);
    expect(commissionAmount(1000, 0).value).toBe(0);
  });
  it("rejects out-of-range input", () => {
    expect(() => commissionAmount(-1, 10)).toThrow();
    expect(() => commissionAmount(100, 101)).toThrow();
    expect(() => commissionAmount(100, -1)).toThrow();
  });
});

describe("sumAmounts", () => {
  it("sums and tracks running totals", () => {
    // 10 + 20.5 + 0.25 = 30.75; running: 10, 30.5, 30.75
    const r = sumAmounts([10, 20.5, 0.25]);
    expect(r.value).toBe(30.75);
    expect(r.math.steps.runningTotals).toEqual([10, 30.5, 30.75]);
  });
  it("sums nothing to zero", () => {
    expect(sumAmounts([]).value).toBe(0);
  });
  it("avoids float drift", () => {
    // 0.1 + 0.2 = 0.30000000000000004 in binary; rounded to cents = 0.3
    expect(sumAmounts([0.1, 0.2]).value).toBe(0.3);
  });
});
