import { describe, expect, it } from "vitest";
import type { LRClaim, LRPolicy } from "../lossRuns";
import {
  DEFAULT_REPLAY_SETTINGS,
  analyzeRetentionOptions,
  assumptionsAndLimitations,
  considerations,
  groupClaimsByPolicyYear,
  otherLineRetained,
  replayYear,
  selectReplayYears,
  totalCostOfRisk,
  type RetentionOption,
} from "../strategy";

/* ------------------------------------------------------------------ */
/* Harbourline Foods GL, as seeded in v0.4 (as-of 2026-11-12)          */
/* ------------------------------------------------------------------ */

const asOf = "2026-11-12";
const gl = (id: string, eff: string, exp: string, prev: string | null, premium: number): LRPolicy => ({
  id,
  lineOfBusiness: "General Liability",
  effectiveDate: eff,
  expiryDate: exp,
  annualPremium: premium,
  exposureBasis: "revenue",
  exposureAmount: 25_000_000,
  previousPolicyId: prev,
});
const policies: LRPolicy[] = [
  gl("py22", "2022-01-11", "2023-01-11", null, 135_000),
  gl("py23", "2023-01-11", "2024-01-11", "py22", 140_000),
  gl("py24", "2024-01-11", "2025-01-11", "py23", 145_000),
  gl("py25", "2025-01-11", "2026-01-11", "py24", 148_000),
  gl("py26", "2026-01-11", "2027-01-11", "py25", 150_000), // running year
  { id: "pr", lineOfBusiness: "Property", effectiveDate: "2026-01-11", expiryDate: "2027-01-11", annualPremium: 212_000, exposureBasis: "square_feet", exposureAmount: 96_000, previousPolicyId: null },
];
let seq = 0;
const claim = (loss: string, paid: number, reserved: number, policyId: string): LRClaim => ({
  id: `c${++seq}`,
  lineOfBusiness: "General Liability",
  claimNumber: `GL-${seq}`,
  dateOfLoss: loss,
  dateReported: loss,
  description: null,
  paid,
  reserved,
  status: reserved > 0 ? "open" : "closed",
  policyId,
});
// Incurred by policy year: PY2022 8,000 + 32,000 + 4,500 = 44,500 · PY2023 15,000 + 120,000 = 135,000
// · PY2024 2,000 + 6,500 + 27,000 = 35,500 · PY2025 60,000 · PY2026 9,000 + 18,000 + 3,000 = 30,000
const claims: LRClaim[] = [
  claim("2022-03-14", 8_000, 0, "py22"),
  claim("2022-07-08", 32_000, 0, "py22"),
  claim("2022-11-02", 4_500, 0, "py22"),
  claim("2023-04-19", 15_000, 0, "py23"),
  claim("2023-08-27", 30_000, 90_000, "py23"),
  claim("2024-02-06", 2_000, 0, "py24"),
  claim("2024-06-18", 6_500, 0, "py24"),
  claim("2024-10-03", 27_000, 0, "py24"),
  claim("2025-05-22", 12_000, 48_000, "py25"),
  claim("2026-02-14", 9_000, 0, "py26"),
  claim("2026-06-30", 18_000, 0, "py26"),
  claim("2026-09-09", 3_000, 0, "py26"),
];
const options: RetentionOption[] = [
  { id: "o10", label: "$10,000 deductible", carrier: "Pacific Crest Insurance (fictional)", deductible: 10_000, aggregateCap: null, premium: 142_000 },
  { id: "o25", label: "$25,000 deductible", carrier: "Pacific Crest Insurance (fictional)", deductible: 25_000, aggregateCap: null, premium: 124_000 },
  { id: "o50", label: "$50,000 deductible", carrier: "Pacific Crest Insurance (fictional)", deductible: 50_000, aggregateCap: null, premium: 110_000 },
];
const grouped = groupClaimsByPolicyYear(claims, policies, "General Liability", asOf).value;

describe("groupClaimsByPolicyYear", () => {
  it("places the twelve claims in five policy years and flags the running year", () => {
    expect(grouped.years.map((y) => y.label)).toEqual(["PY2022", "PY2023", "PY2024", "PY2025", "PY2026"]);
    expect(grouped.years.map((y) => y.incurred)).toEqual([44_500, 135_000, 35_500, 60_000, 30_000]);
    expect(grouped.years.map((y) => y.current)).toEqual([false, false, false, false, true]);
    // 2026-01-11 to 2026-11-12 = 10 whole months → bucket 12; 2022-01-11 → 58 months → 48
    expect(grouped.years[4].ageBucket).toBe("12");
    expect(grouped.years[0].ageBucket).toBe("48");
    expect(grouped.prospectiveYear).toBe(2027);
    expect(grouped.excludedOutsidePeriod).toBe(0);
    // PY2023 has one open claim with 90,000 reserved
    expect(grouped.years[1].openCount).toBe(1);
    expect(grouped.years[1].openReserved).toBe(90_000);
  });

  it("counts a claim outside every period as excluded", () => {
    const stray = groupClaimsByPolicyYear([claim("2019-01-01", 1_000, 0, "py22")], policies, "General Liability", asOf).value;
    expect(stray.excludedOutsidePeriod).toBe(1);
    expect(stray.years.every((y) => y.claims.length === 0)).toBe(true);
  });
});

describe("replayYear", () => {
  const py23 = selectReplayYears(grouped, DEFAULT_REPLAY_SETTINGS).value.years[1];
  it("limits each claim to the deductible: min(15,000, 25,000) + min(120,000, 25,000) = 40,000", () => {
    const r = replayYear(py23, 25_000, null).value;
    expect(r.retained).toBe(40_000);
    // transferred = 135,000 − 40,000 = 95,000
    expect(r.transferred).toBe(95_000);
    expect(r.capApplied).toBe(false);
  });
  it("then applies the aggregate cap: min(40,000, 30,000) = 30,000", () => {
    const r = replayYear(py23, 25_000, 30_000).value;
    expect(r.retainedBeforeCap).toBe(40_000);
    expect(r.retained).toBe(30_000);
    expect(r.capApplied).toBe(true);
    // transferred = 135,000 − 30,000 = 105,000
    expect(r.transferred).toBe(105_000);
  });
  it("refuses a negative deductible", () => {
    expect(() => replayYear(py23, -1, null)).toThrow();
  });
});

describe("analyzeRetentionOptions (Harbourline, three Pacific Crest options)", () => {
  const a = analyzeRetentionOptions(grouped, options).value;
  const by = (id: string) => a.options.find((o) => o.option.id === id)!;

  it("uses the five most recent years including the running year, raw", () => {
    expect(a.years.map((y) => y.label)).toEqual(["PY2022", "PY2023", "PY2024", "PY2025", "PY2026"]);
    expect(a.omittedYears).toEqual([]);
    expect(a.adjusted).toBe(false);
    expect(a.basisLabel).toBe("raw incurred");
    expect(a.baseOptionId).toBe("o10");
    expect(by("o10").isBase).toBe(true);
  });

  it("replays retained by year at each deductible", () => {
    // $10,000: min(8,000,10k)+min(32,000,10k)+min(4,500,10k) = 22,500; 10k+10k = 20,000; 2,000+6,500+10,000 = 18,500; 10,000; 9,000+10,000+3,000 = 22,000
    expect(by("o10").years.map((y) => y.retained)).toEqual([22_500, 20_000, 18_500, 10_000, 22_000]);
    // $25,000: 8,000+25,000+4,500 = 37,500; 15,000+25,000 = 40,000; 2,000+6,500+25,000 = 33,500; 25,000; 9,000+18,000+3,000 = 30,000
    expect(by("o25").years.map((y) => y.retained)).toEqual([37_500, 40_000, 33_500, 25_000, 30_000]);
    // $50,000: 44,500; 15,000+50,000 = 65,000; 35,500; 50,000; 30,000
    expect(by("o50").years.map((y) => y.retained)).toEqual([44_500, 65_000, 35_500, 50_000, 30_000]);
    // transferred = incurred − retained, e.g. PY2023 at $10,000: 135,000 − 20,000 = 115,000
    expect(by("o10").years[1].transferred).toBe(115_000);
  });

  it("averages retained per year: 93,000 ÷ 5 = 18,600; 166,000 ÷ 5 = 33,200; 225,000 ÷ 5 = 45,000", () => {
    expect(by("o10").averageRetained).toBe(18_600);
    expect(by("o25").averageRetained).toBe(33_200);
    expect(by("o50").averageRetained).toBe(45_000);
  });

  it("finds the worst year and its retained", () => {
    // $10,000: PY2022 22,500 beats PY2026 22,000
    expect(by("o10").worstYear).toEqual({ label: "PY2022", retained: 22_500, claimCount: 3 });
    expect(by("o25").worstYear).toEqual({ label: "PY2023", retained: 40_000, claimCount: 2 });
    expect(by("o50").worstYear).toEqual({ label: "PY2023", retained: 65_000, claimCount: 2 });
  });

  it("expected total cost = premium + average retained: 160,600; 157,200; 155,000", () => {
    expect(by("o10").expectedTotalCost).toBe(160_600); // 142,000 + 18,600
    expect(by("o25").expectedTotalCost).toBe(157_200); // 124,000 + 33,200
    expect(by("o50").expectedTotalCost).toBe(155_000); // 110,000 + 45,000
  });

  it("worst-year total = premium + worst-year retained", () => {
    expect(by("o10").worstYearTotalCost).toBe(164_500); // 142,000 + 22,500
    expect(by("o25").worstYearTotalCost).toBe(164_000); // 124,000 + 40,000
    expect(by("o50").worstYearTotalCost).toBe(175_000); // 110,000 + 65,000
  });

  it("compares with the $10,000 base: saving, additional retained, net, break-even", () => {
    const b = by("o10");
    expect([b.premiumSaving, b.additionalRetained, b.netSaving, b.breakEvenRetained]).toEqual([0, 0, 0, 0]);
    expect(b.worstYearTest).toBeNull();
    const o25 = by("o25");
    expect(o25.premiumSaving).toBe(18_000); // 142,000 − 124,000
    expect(o25.additionalRetained).toBe(14_600); // 33,200 − 18,600
    expect(o25.netSaving).toBe(3_400); // 18,000 − 14,600
    expect(o25.breakEvenRetained).toBe(18_000);
    const o50 = by("o50");
    expect(o50.premiumSaving).toBe(32_000); // 142,000 − 110,000
    expect(o50.additionalRetained).toBe(26_400); // 45,000 − 18,600
    expect(o50.netSaving).toBe(5_600); // 32,000 − 26,400
    expect(o50.breakEvenRetained).toBe(32_000);
  });

  it("worst historical year test: PY2023 additional 20,000 vs 18,000 saving; 45,000 vs 32,000", () => {
    const t25 = by("o25").worstYearTest!;
    // option 40,000 − base 20,000 = 20,000 additional; 20,000 − 18,000 = 2,000 more than the base
    expect(t25).toMatchObject({ label: "PY2023", optionRetained: 40_000, baseRetained: 20_000, additionalRetained: 20_000, premiumSaving: 18_000, costVersusBase: 2_000 });
    expect(t25.sentence).toBe("In PY2023 this option would have cost $2,000 more than the base.");
    const t50 = by("o50").worstYearTest!;
    // 65,000 − 20,000 = 45,000 additional; 45,000 − 32,000 = 13,000 more than the base
    expect(t50).toMatchObject({ label: "PY2023", additionalRetained: 45_000, premiumSaving: 32_000, costVersusBase: 13_000 });
    expect(t50.sentence).toBe("In PY2023 this option would have cost $13,000 more than the base.");
  });

  it("maximum annual exposure = deductible × most claims in a year (3, PY2022)", () => {
    expect(by("o10").maxAnnualExposure).toEqual({ value: 30_000, basis: "deductible × claims", claimCount: 3, claimYear: "PY2022" });
    expect(by("o25").maxAnnualExposure.value).toBe(75_000);
    expect(by("o50").maxAnnualExposure.value).toBe(150_000);
  });

  it("shows the math, including the replay line for every option and year", () => {
    const lines = analyzeRetentionOptions(grouped, options).math.steps.lines as string[];
    expect(lines).toContain("$25,000 deductible, PY2023: retained = min($15,000, $25,000) + min($120,000, $25,000) = $40,000; transferred = $135,000 − $40,000 = $95,000");
    expect(lines.some((l) => l.startsWith("$25,000 deductible: average retained = ($37,500 + $40,000 + $33,500 + $25,000 + $30,000) ÷ 5 = $33,200.00"))).toBe(true);
  });

  it("marks nothing as recommended: the shape carries no such field", () => {
    expect(Object.keys(by("o50"))).not.toContain("recommended");
  });
});

describe("analyzeRetentionOptions settings", () => {
  it("excluding the running year leaves four years: $10,000 average = 71,000 ÷ 4 = 17,750", () => {
    const a = analyzeRetentionOptions(grouped, options, { ...DEFAULT_REPLAY_SETTINGS, includeCurrentYear: false }).value;
    expect(a.years.map((y) => y.label)).toEqual(["PY2022", "PY2023", "PY2024", "PY2025"]);
    expect(a.omittedYears).toEqual([{ label: "PY2026", reason: "running year excluded by the settings" }]);
    // 22,500 + 20,000 + 18,500 + 10,000 = 71,000
    expect(a.options[0].averageRetained).toBe(17_750);
  });

  it("three years keeps the most recent three", () => {
    const a = analyzeRetentionOptions(grouped, options, { ...DEFAULT_REPLAY_SETTINGS, yearsToUse: 3 }).value;
    expect(a.years.map((y) => y.label)).toEqual(["PY2024", "PY2025", "PY2026"]);
    expect(a.omittedYears.map((o) => o.label)).toEqual(["PY2022", "PY2023"]);
    // $50,000: (35,500 + 50,000 + 30,000) ÷ 3 = 38,500
    expect(a.options[2].averageRetained).toBe(38_500);
  });

  it("an aggregate cap limits each year and becomes the maximum exposure when lower", () => {
    const capped = options.map((o) => (o.id === "o50" ? { ...o, aggregateCap: 40_000 } : o));
    const a = analyzeRetentionOptions(grouped, capped).value;
    const o50 = a.options[2];
    // 44,500→40,000; 65,000→40,000; 35,500; 50,000→40,000; 30,000 → 185,500 ÷ 5 = 37,100
    expect(o50.years.map((y) => y.retained)).toEqual([40_000, 40_000, 35_500, 40_000, 30_000]);
    expect(o50.years.map((y) => y.capApplied)).toEqual([true, true, false, true, false]);
    expect(o50.averageRetained).toBe(37_100);
    expect(o50.maxAnnualExposure).toEqual({ value: 40_000, basis: "aggregate cap", claimCount: 3, claimYear: "PY2022" });
  });

  it("trend restates each claim before the deductible applies", () => {
    // 10% trend to 2027: PY2026 exponent 1 → 9,900 + 19,800 + 3,300; at $10,000: 9,900 + 10,000 + 3,300 = 23,200
    const a = analyzeRetentionOptions(grouped, options, { ...DEFAULT_REPLAY_SETTINGS, adjustments: { trendRate: 0.1, factors: null } }).value;
    expect(a.adjusted).toBe(true);
    expect(a.basisLabel).toBe("adjusted: trend 10.0%");
    expect(a.years[4].claims.map((c) => c.adjustedIncurred)).toEqual([9_900, 19_800, 3_300]);
    expect(a.options[0].years[4].retained).toBe(23_200);
    // PY2022 exponent 5: 8,000 × 1.1^5 = 12,884.08
    expect(a.years[0].claims[0].adjustedIncurred).toBe(12_884.08);
  });

  it("development applies the factor for the year's age bucket", () => {
    // PY2026 is age 12 → 1.5: 9,000 × 1.5 = 13,500; PY2022 is age 48 → 1.0
    const a = analyzeRetentionOptions(grouped, options, { ...DEFAULT_REPLAY_SETTINGS, adjustments: { trendRate: null, factors: { "12": 1.5, "24": 1.2, "36": 1.1, "48": 1, "60+": 1 } } }).value;
    expect(a.years[4].claims[0].adjustedIncurred).toBe(13_500);
    expect(a.years[0].claims[0].adjustedIncurred).toBe(8_000);
    expect(a.basisLabel).toBe("adjusted: development");
  });

  it("ties on deductible pick the cheaper option as base; no options means no base", () => {
    const tie = analyzeRetentionOptions(grouped, [{ ...options[0], id: "x", premium: 150_000 }, options[0]]).value;
    expect(tie.baseOptionId).toBe("o10");
    expect(analyzeRetentionOptions(grouped, []).value.baseOptionId).toBeNull();
  });
});

describe("totalCostOfRisk", () => {
  it("premiums 300,000 + retained 45,000 + fees 15,000 + risk control 10,000 = 370,000; 1.48% of 25,000,000; $14.80 per $1,000", () => {
    const t = totalCostOfRisk({
      optionLabel: "$50,000 deductible",
      premiums: [
        { label: "General Liability", amount: 110_000, substituted: true },
        { label: "Property", amount: 190_000, substituted: false },
      ],
      retained: [{ label: "General Liability", amount: 45_000, analysed: true }],
      brokerFees: 15_000,
      riskControlSpend: 10_000,
      claimsAdminCost: 0,
      revenue: 25_000_000,
    }).value;
    expect(t.components.premiums).toBe(300_000);
    expect(t.total).toBe(370_000);
    // 370,000 ÷ 25,000,000 = 0.0148
    expect(t.percentOfRevenue).toBe(0.0148);
    // 370,000 ÷ 25,000 = 14.80
    expect(t.perThousandRevenue).toBe(14.8);
    expect(t.flagged).toEqual([]);
  });

  it("counts a line without loss runs as zero and flags it; no revenue gives null ratios", () => {
    const t = totalCostOfRisk({
      optionLabel: "x",
      premiums: [{ label: "GL", amount: 100_000, substituted: true }],
      retained: [
        { label: "GL", amount: 10_000, analysed: true },
        { label: "Property", amount: null, analysed: false },
      ],
      brokerFees: 0,
      riskControlSpend: 0,
      claimsAdminCost: 2_500,
      revenue: null,
    }).value;
    // 100,000 + 10,000 + 0 + 0 + 2,500 = 112,500
    expect(t.total).toBe(112_500);
    expect(t.flagged).toEqual(["Property"]);
    expect(t.percentOfRevenue).toBeNull();
    expect(t.perThousandRevenue).toBeNull();
  });

  it("refuses negative fees", () => {
    expect(() => totalCostOfRisk({ optionLabel: "x", premiums: [], retained: [], brokerFees: -1, riskControlSpend: 0, claimsAdminCost: 0, revenue: null })).toThrow();
  });
});

describe("otherLineRetained", () => {
  it("replays another line below its own deductible: GL at $10,000 over five years = 18,600", () => {
    const r = otherLineRetained(claims, policies, "General Liability", 10_000, asOf).value;
    expect(r).toEqual({ averageRetained: 18_600, years: 5, reason: null });
  });
  it("is null and flagged for a line with periods but no claims", () => {
    expect(otherLineRetained(claims, policies, "Property", 25_000, asOf).value).toEqual({ averageRetained: null, years: 1, reason: "no loss runs" });
  });
  it("is null without a deductible or without periods", () => {
    expect(otherLineRetained(claims, policies, "Property", null, asOf).value.reason).toBe("no deductible on the policy");
    expect(otherLineRetained(claims, policies, "Cyber", 5_000, asOf).value.reason).toBe("no policy periods");
  });
});

describe("considerations", () => {
  const years = selectReplayYears(grouped, DEFAULT_REPLAY_SETTINGS).value.years;
  it("lists the five neutral topics with the account's own figures", () => {
    const c = considerations({ years, contractRequirements: ["Westbay Grocers: GL $2,000,000 / $4,000,000"], revenue: 25_000_000 }).value;
    expect(c.map((x) => x.topic)).toEqual(["Cash flow", "Claim volatility", "Frequency trend", "Open reserves", "Contract requirements"]);
    expect(c[1].observation).toBe("Incurred ranged from $30,000 to $135,000 across the 5 years used (average $61,000.00).");
    // complete years PY2022–PY2025: first half (3, 2) avg 2.5; second half (3, 1) avg 2 → falling
    expect(c[2].observation).toContain("frequency is falling");
    // open: PY2023 90,000 + PY2025 48,000 = 138,000
    expect(c[3].observation).toBe("2 open claims carry $138,000 of reserves that can still move.");
    expect(c[4].observation).toContain("1 contract requirement applies to this line");
    for (const x of c) expect(`${x.favoursLower} ${x.favoursHigher}`).not.toMatch(/recommend/i);
  });
});

describe("assumptionsAndLimitations", () => {
  it("states the years, the running year, the adjustments actually used, caps, unlinked premiums and missing items", () => {
    const lines = assumptionsAndLimitations({
      line: "General Liability",
      asOf,
      settings: { yearsToUse: 5, includeCurrentYear: false, adjustments: { trendRate: 0.05, factors: null } },
      yearsUsed: [{ label: "PY2022", current: false }, { label: "PY2025", current: false }],
      omittedYears: [{ label: "PY2026", reason: "running year excluded by the settings" }],
      prospectiveYear: 2027,
      options: [
        { label: "$10,000 deductible", aggregateCap: null, linkedToQuote: true },
        { label: "$50,000 deductible", aggregateCap: 40_000, linkedToQuote: false },
      ],
      missing: ["Annual revenue not entered"],
      linesWithoutLossRuns: ["Property"],
    }).value;
    expect(lines[0]).toBe("Loss history: General Liability claims replayed over 2 policy years (PY2022, PY2025), as of 2026-11-12.");
    expect(lines).toContain("PY2026 is not used: running year excluded by the settings.");
    expect(lines).toContain("Loss trend of 5.0% a year restates each year to 2027: factor = (1 + trend) ^ (2027 − policy year).");
    expect(lines).toContain("No loss development is applied: open claims are at their current paid plus reserved.");
    expect(lines).toContain("Aggregate caps: $50,000 deductible capped at $40,000 a year; other options have no cap.");
    expect(lines).toContain("Premiums for $50,000 deductible were entered by hand and are not tied to a carrier quote.");
    expect(lines).toContain("Total cost of risk counts expected retained losses as zero for Property because no claims are recorded for that line.");
    expect(lines).toContain("Annual revenue not entered.");
    expect(lines[lines.length - 1]).toBe("This report compares options; it does not state which the client should buy.");
  });
});
