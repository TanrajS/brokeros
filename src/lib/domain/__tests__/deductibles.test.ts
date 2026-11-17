import { describe, expect, it } from "vitest";
import { DEFAULT_PERIL, checkPartLimits, deductibleForClaim, describePartLimits, describeRule, flatRule, matchRule, retainedAboveLimit, validateScheduleRows, type DeductibleRule } from "../deductibles";

const rule = (over: Partial<DeductibleRule> & Pick<DeductibleRule, "appliesTo" | "kind">): DeductibleRule => ({ amount: null, percent: null, minimum: null, maximum: null, hours: null, isDefault: false, ...over });
const earthquake = rule({ appliesTo: "Earthquake", kind: "percent_of_loss", percent: 10, minimum: 100_000 });
const stock = rule({ appliesTo: "Stock", kind: "flat", amount: 10_000 });
const eqValue = rule({ appliesTo: "Earthquake", kind: "percent_of_value", percent: 10, minimum: 250_000 });
const bi = rule({ appliesTo: "Business interruption", kind: "waiting_period", hours: 72 });

describe("deductibleForClaim", () => {
  it("Earthquake 10% of loss, minimum 100,000: 2,000,000 → 200,000; 500,000 → 100,000", () => {
    // 10% × 2,000,000 = 200,000 (above the minimum)
    expect(deductibleForClaim(earthquake, 2_000_000).value.amount).toBe(200_000);
    // 10% × 500,000 = 50,000 → raised to the 100,000 minimum
    expect(deductibleForClaim(earthquake, 500_000).value.amount).toBe(100_000);
  });
  it("Stock flat 10,000 on a 30,000 loss gives 10,000", () => {
    expect(deductibleForClaim(stock, 30_000).value).toMatchObject({ amount: 10_000, hours: null, flags: [] });
  });
  it("applies the maximum", () => {
    const capped = rule({ appliesTo: "Flood", kind: "percent_of_loss", percent: 5, maximum: 20_000 });
    // 5% × 1,000,000 = 50,000 → capped at 20,000
    expect(deductibleForClaim(capped, 1_000_000).value.amount).toBe(20_000);
  });
  it("percent of value uses the value at risk, and falls back to the minimum with a flag when none is known", () => {
    // 10% × 3,000,000 = 300,000
    expect(deductibleForClaim(eqValue, 50_000, 3_000_000).value.amount).toBe(300_000);
    const none = deductibleForClaim(eqValue, 50_000).value;
    expect([none.amount, none.flags]).toEqual([250_000, ["no value at risk known for this claim"]]);
    // without a minimum there is no dollar figure at all
    expect(deductibleForClaim({ ...eqValue, minimum: null }, 50_000).value.amount).toBeNull();
  });
  it("a waiting period is hours, not dollars", () => {
    expect(deductibleForClaim(bi, 80_000).value).toMatchObject({ amount: null, hours: 72, flags: ["waiting period: not a dollar deductible"] });
  });
  it("refuses a negative incurred", () => {
    expect(() => deductibleForClaim(stock, -1)).toThrow();
  });
});

describe("matchRule", () => {
  const rules = [flatRule(100_000), earthquake, stock];
  it("matches the peril case-insensitively and falls back to the default", () => {
    expect(matchRule(rules, "stock").value?.appliesTo).toBe("Stock");
    expect(matchRule(rules, " EARTHQUAKE ").value?.appliesTo).toBe("Earthquake");
    expect(matchRule(rules, "Theft").value?.isDefault).toBe(true);
    expect(matchRule(rules, null).value?.appliesTo).toBe(DEFAULT_PERIL);
    expect(matchRule([earthquake], "Theft").value).toBeNull();
  });
  it("describes rules in words", () => {
    expect(describeRule(earthquake)).toBe("Earthquake: 10% of loss, minimum $100,000");
    expect(describeRule(bi)).toBe("Business interruption: 72-hour waiting period");
    expect(describeRule(flatRule(100_000))).toBe("All other perils: $100,000");
  });
});

describe("validateScheduleRows", () => {
  it("enforces kind-specific fields, minimum ≤ maximum and unique perils", () => {
    const rs = validateScheduleRows(
      [
        { applies_to: "Earthquake", kind: "percent_of_loss", percent: "10", minimum: "100000" },
        { applies_to: "Stock", kind: "flat", amount: "" },
        { applies_to: "Flood", kind: "percent of loss", percent: "" },
        { applies_to: "BI", kind: "waiting_period", hours: "72" },
        { applies_to: "Glass", kind: "flat", amount: "1000", minimum: "5000", maximum: "1000" },
        { applies_to: "earthquake", kind: "flat", amount: "5" },
        { applies_to: "Theft", kind: "flat", amount: "10000" },
      ],
      { existingAppliesTo: ["Theft"] },
    ).value;
    expect(rs.map((r) => r.valid)).toEqual([true, false, false, true, false, false, false]);
    expect(rs[0].parsed).toMatchObject({ kind: "percent_of_loss", percent: 10, minimum: 100_000, maximum: null, amount: null });
    expect(rs[1].reasons).toEqual(["a flat rule needs an amount"]);
    expect(rs[2].reasons).toEqual(["a percent rule needs a percent"]);
    expect(rs[3].parsed).toMatchObject({ kind: "waiting_period", hours: 72 });
    expect(rs[4].reasons[0]).toMatch(/minimum \$5,000 is above maximum \$1,000/);
    expect(rs[5].reasons).toEqual(['"earthquake" already has a rule']);
    expect(rs[6].reasons).toEqual(['"Theft" already has a rule']);
  });
});

describe("coverage parts with their own limits (v1.5.1)", () => {
  const headline = { occurrenceLimit: 1_000_000, aggregateLimit: 2_000_000 };
  it("describes a part's limits in words, or nothing when it has none of its own", () => {
    expect(describePartLimits({ occurrenceLimit: 25_000_000, aggregateLimit: null })).toBe("$25,000,000 per occurrence");
    expect(describePartLimits({ occurrenceLimit: 50_000_000, aggregateLimit: 50_000_000 })).toBe("$50,000,000 per occurrence, $50,000,000 aggregate");
    expect(describePartLimits({ occurrenceLimit: null, aggregateLimit: 100_000_000 })).toBe("$100,000,000 aggregate");
    expect(describePartLimits({ occurrenceLimit: null, aggregateLimit: null })).toBeNull();
  });
  it("blocks an aggregate below the occurrence limit and only warns above the headline", () => {
    // 500,000 aggregate < 600,000 occurrence → error
    expect(checkPartLimits({ appliesTo: "Stock", occurrenceLimit: 600_000, aggregateLimit: 500_000 }, headline).value.errors).toEqual(["Aggregate limit $500,000 is below the occurrence limit $600,000"]);
    // 1,500,000 > the policy's 1,000,000 → warning, not an error (some carriers write higher sublimits)
    const r = checkPartLimits({ appliesTo: "Flood", occurrenceLimit: 1_500_000, aggregateLimit: 2_500_000 }, headline).value;
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual(["Flood: occurrence limit $1,500,000 is above the policy's $1,000,000", "Flood: aggregate limit $2,500,000 is above the policy's $2,000,000"]);
    expect(checkPartLimits({ appliesTo: "Glass", occurrenceLimit: 250_000, aggregateLimit: null }, headline).value).toEqual({ errors: [], warnings: [] });
    expect(checkPartLimits({ appliesTo: "Glass", occurrenceLimit: 250_000, aggregateLimit: null }, { occurrenceLimit: null, aggregateLimit: null }).value.warnings).toEqual([]);
  });
  it("retains the part of a loss above the occurrence limit; nothing without a limit", () => {
    // 600,000 − 250,000 = 350,000
    expect(retainedAboveLimit(600_000, 250_000).value).toBe(350_000);
    expect(retainedAboveLimit(200_000, 250_000).value).toBe(0);
    expect(retainedAboveLimit(600_000, null).value).toBe(0);
    expect(() => retainedAboveLimit(-1, null)).toThrow();
  });
  it("imports occurrence_limit and aggregate_limit, rejects aggregate below occurrence and warns above the headline", () => {
    const rs = validateScheduleRows(
      [
        { applies_to: "Stock", kind: "flat", amount: "10000", occurrence_limit: "25000000" },
        { applies_to: "Flood", kind: "flat", amount: "250000", occurrence_limit: "50000000", aggregate_limit: "50000000" },
        { applies_to: "Transit", kind: "flat", amount: "5000", occurrence_limit: "2000000", aggregate_limit: "1000000" },
        { applies_to: "Glass", kind: "flat", amount: "1000", occurrence_limit: "abc" },
      ],
      { existingAppliesTo: [], headline: { occurrenceLimit: 30_000_000, aggregateLimit: null } },
    ).value;
    expect(rs.map((r) => r.valid)).toEqual([true, true, false, false]);
    expect(rs[0].parsed).toMatchObject({ occurrenceLimit: 25_000_000, aggregateLimit: null });
    expect(rs[0].warnings).toEqual([]);
    // 50,000,000 > the 30,000,000 headline → warning only
    expect(rs[1].warnings).toEqual(["Flood: occurrence limit $50,000,000 is above the policy's $30,000,000"]);
    expect(rs[2].reasons).toEqual(["aggregate limit $1,000,000 is below the occurrence limit $2,000,000"]);
    expect(rs[3].reasons).toEqual(['occurrence_limit "abc" is not a non-negative amount']);
  });
});
