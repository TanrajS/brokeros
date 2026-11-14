import { describe, expect, it } from "vitest";
import { analyzeRetentionOptions, groupClaimsByPolicyYear, totalCostOfRisk } from "@/lib/domain/strategy";
import { buildDemoBook } from "../demoBookData";
import { demoAccountToLossRuns } from "../demoBookLossRuns";
import { demoRetentionOptions } from "../demoBookStrategy";

const asOf = "2026-11-12";
const book = buildDemoBook(asOf);
const find = (name: string) => book.find((a) => a.name === name)!;
const analyse = (name: string, policyKey: string) => {
  const account = find(name);
  const { policies, claims } = demoAccountToLossRuns(account);
  const policy = account.policies.find((p) => p.key === policyKey)!;
  const grouped = groupClaimsByPolicyYear(claims, policies, "General Liability", asOf).value;
  return { account, policy, analysis: analyzeRetentionOptions(grouped, demoRetentionOptions(policy)).value };
};

describe("Harbourline Foods retention options (hand-verification case)", () => {
  const { account, policy, analysis: a } = analyse("Harbourline Foods Inc.", "harbour-gl");

  it("seeds three Pacific Crest options, the $10,000 one linked to the Pacific Crest quote", () => {
    expect(policy.retentionOptions.map((o) => [o.deductible, o.premium])).toEqual([
      [10_000, 142_000],
      [25_000, 124_000],
      [50_000, 110_000],
    ]);
    expect(policy.retentionOptions[0].sourceQuoteKey).toBe("harbour-pacific-crest");
    const quote = policy.submissions.flatMap((s) => s.quotes).find((q) => q.key === "harbour-pacific-crest")!;
    expect(quote.premium).toBe(142_000);
    expect(quote.deductible).toBe(10_000);
  });

  it("replays the specified retained figures and averages", () => {
    expect(a.options.map((o) => o.years.map((y) => y.retained))).toEqual([
      [22_500, 20_000, 18_500, 10_000, 22_000],
      [37_500, 40_000, 33_500, 25_000, 30_000],
      [44_500, 65_000, 35_500, 50_000, 30_000],
    ]);
    expect(a.options.map((o) => o.averageRetained)).toEqual([18_600, 33_200, 45_000]);
    expect(a.options.map((o) => o.expectedTotalCost)).toEqual([160_600, 157_200, 155_000]);
    expect(a.options.map((o) => o.netSaving)).toEqual([0, 3_400, 5_600]);
  });

  it("worst-year test: PY2023, 20,000 vs 18,000 and 45,000 vs 32,000", () => {
    expect(a.options[1].worstYearTest).toMatchObject({ label: "PY2023", additionalRetained: 20_000, premiumSaving: 18_000, costVersusBase: 2_000 });
    expect(a.options[2].worstYearTest).toMatchObject({ label: "PY2023", additionalRetained: 45_000, premiumSaving: 32_000, costVersusBase: 13_000 });
  });

  it("carries the TCOR inputs: broker fee 15,000 and risk control 10,000 on 25,000,000 revenue", () => {
    expect([account.brokerFees, account.riskControlSpend, account.claimsAdminCost, account.annualRevenue]).toEqual([15_000, 10_000, 0, 25_000_000]);
    // Spec check with the $50,000 option: 300,000 premiums + 45,000 + 15,000 + 10,000 = 370,000 → 1.48%, $14.80 per $1,000
    const t = totalCostOfRisk({
      optionLabel: "$50,000 deductible",
      premiums: [
        { label: "General Liability", amount: 110_000, substituted: true },
        { label: "Other lines", amount: 190_000, substituted: false },
      ],
      retained: [{ label: "General Liability", amount: a.options[2].averageRetained, analysed: true }],
      brokerFees: account.brokerFees,
      riskControlSpend: account.riskControlSpend,
      claimsAdminCost: account.claimsAdminCost,
      revenue: account.annualRevenue,
    }).value;
    expect([t.total, t.percentOfRevenue, t.perThousandRevenue]).toEqual([370_000, 0.0148, 14.8]);
  });
});

describe("Cedar Ridge retention options (low frequency, one open loss)", () => {
  const { policy, analysis: a } = analyse("Cedar Ridge Mechanical Ltd.", "cedar-gl");

  it("seeds $5,000 / $108,000, $10,000 / $103,500 and $25,000 / $97,000 with Northgate", () => {
    expect(policy.retentionOptions.map((o) => [o.deductible, o.premium, o.carrier])).toEqual([
      [5_000, 108_000, "Northgate Mutual"],
      [10_000, 103_500, "Northgate Mutual"],
      [25_000, 97_000, "Northgate Mutual"],
    ]);
  });

  it("replays three claims over five years: 11,000 (PY2022), 4,200 (PY2024), 45,000 open (PY2025)", () => {
    expect(a.years.map((y) => y.label)).toEqual(["PY2022", "PY2023", "PY2024", "PY2025", "PY2026"]);
    expect(a.years.map((y) => y.incurred)).toEqual([11_000, 0, 4_200, 45_000, 0]);
    // $5,000: 5,000; 0; 4,200; 5,000; 0 = 14,200 ÷ 5 = 2,840
    // $10,000: 10,000; 0; 4,200; 10,000; 0 = 24,200 ÷ 5 = 4,840
    // $25,000: 11,000; 0; 4,200; 25,000; 0 = 40,200 ÷ 5 = 8,040
    expect(a.options.map((o) => o.averageRetained)).toEqual([2_840, 4_840, 8_040]);
    // 108,000 + 2,840; 103,500 + 4,840; 97,000 + 8,040
    expect(a.options.map((o) => o.expectedTotalCost)).toEqual([110_840, 108_340, 105_040]);
    // saving 4,500 − additional 2,000 = 2,500; saving 11,000 − 5,200 = 5,800
    expect(a.options.map((o) => o.netSaving)).toEqual([0, 2_500, 5_800]);
  });

  it("the one open loss drives the worst year: PY2025 at $25,000 costs 9,000 more than the base", () => {
    // option 25,000 − base 5,000 = 20,000 additional vs 11,000 saving
    expect(a.options[2].worstYearTest).toMatchObject({ label: "PY2025", optionRetained: 25_000, baseRetained: 5_000, additionalRetained: 20_000, premiumSaving: 11_000, costVersusBase: 9_000 });
    expect(a.options[2].worstYearTest!.sentence).toBe("In PY2025 this option would have cost $9,000 more than the base.");
    // most claims in any year is 1, so max exposure = deductible × 1
    expect(a.options.map((o) => o.maxAnnualExposure.value)).toEqual([5_000, 10_000, 25_000]);
  });
});
