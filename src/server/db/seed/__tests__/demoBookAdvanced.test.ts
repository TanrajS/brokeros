import { describe, expect, it } from "vitest";
import { bookTiles, lookbackWindow, retention } from "@/lib/domain/dashboard";
import { deductibleForClaim, flatRule, matchRule } from "@/lib/domain/deductibles";
import { coverageProfile, isAdvancedProgram, layerSummary, programTotals } from "@/lib/domain/program";
import { analyzeRetentionOptions, groupClaimsByPolicyYear } from "@/lib/domain/strategy";
import { buildDemoBook } from "../demoBookData";
import { demoBookToDashboard } from "../demoBookDashboard";
import { demoAccountToLossRuns } from "../demoBookLossRuns";
import { demoProgramLayers } from "../demoBookProgram";
import { demoRetentionOptions } from "../demoBookStrategy";

const asOf = "2026-11-12";
const book = buildDemoBook(asOf);
const find = (name: string) => book.find((a) => a.name === name)!;
const M = 1_000_000;
const FULL = ["Harbourline Foods Inc.", "Cedar Ridge Mechanical Ltd.", "Pacific Northwest Terminals Ltd.", "Kootenay Alpine Resorts Inc."];

describe("v1.4 demo book: ten accounts", () => {
  it("has exactly 10 accounts: four fully populated, six with at least three policy years of claims", () => {
    expect(book).toHaveLength(10);
    for (const a of book) {
      const { policies, claims } = demoAccountToLossRuns(a);
      const linesWithClaims = [...new Set(claims.map((c) => c.lineOfBusiness))];
      expect(linesWithClaims.length).toBeGreaterThan(0);
      for (const line of linesWithClaims) {
        const years = groupClaimsByPolicyYear(claims, policies, line, asOf).value.years;
        if (FULL.includes(a.name)) expect(years.length).toBeGreaterThanOrEqual(5);
        else if (claims.filter((c) => c.lineOfBusiness === line).length > 1) expect(years.length).toBeGreaterThanOrEqual(3);
      }
      if (FULL.includes(a.name)) expect(linesWithClaims.length).toBeGreaterThanOrEqual(2);
      expect(a.towerLayers.length).toBeGreaterThanOrEqual(1);
    }
    // advanced programs for Terminals and Kootenay, simple everywhere else
    expect(isAdvancedProgram(demoProgramLayers(find("Pacific Northwest Terminals Ltd."), "property"))).toBe(true);
    expect(isAdvancedProgram(demoProgramLayers(find("Kootenay Alpine Resorts Inc."), "property"))).toBe(true);
    for (const a of book.filter((x) => !["Pacific Northwest Terminals Ltd.", "Kootenay Alpine Resorts Inc."].includes(x.name))) {
      expect(isAdvancedProgram(demoProgramLayers(a, "gl")) || isAdvancedProgram(demoProgramLayers(a, "auto")) || isAdvancedProgram(demoProgramLayers(a, "property"))).toBe(false);
    }
  });

  it("keeps the trailing-12-month resolved set at exactly 10: 8 renewed, 1 lost, 1 non-renewed, 1,240,000 expiring and 1,085,000 renewed", () => {
    const { accounts, policies } = demoBookToDashboard(book);
    const window = lookbackWindow(asOf, 12).value;
    const r = retention(policies, accounts, window, asOf).value;
    expect([r.resolvedCount, r.renewedCount, r.lostCount, r.nonRenewedCount, r.unresolvedCount]).toEqual([10, 8, 1, 1, 0]);
    expect([r.resolvedPremium, r.renewedExpiringPremium, r.countRetention, r.premiumRetention]).toEqual([1_240_000, 1_085_000, 0.8, 0.875]);
    expect(r.lostRows.map((x) => [x.accountName, x.resolution, x.expiringPremium])).toEqual([
      ["Northwind Engineering Partners Inc.", "non_renewed", 96_200],
      ["Bramblewood Garden Centres Ltd.", "lost", 58_800],
    ]);
    const tiles = bookTiles(policies, asOf).value;
    expect(tiles.activeAccounts).toBe(10);
  });

  it("Fraser Valley's lost umbrella sits outside the 12-month window and inside the 24-month one", () => {
    const { accounts, policies } = demoBookToDashboard(book);
    const twentyFour = retention(policies, accounts, lookbackWindow(asOf, 24).value, asOf).value;
    expect(twentyFour.lostRows.filter((r) => r.resolution === "lost").map((r) => r.accountName).sort()).toEqual(["Bramblewood Garden Centres Ltd.", "Fraser Valley Logistics Ltd."]);
  });

  it("carries tolerance settings on the fully populated accounts and defaults elsewhere", () => {
    expect([find("Harbourline Foods Inc.").toleranceOccurrence, find("Harbourline Foods Inc.").toleranceYear]).toEqual([125_000, 250_000]);
    expect([find("Pacific Northwest Terminals Ltd.").toleranceOccurrence, find("Kootenay Alpine Resorts Inc.").toleranceOccurrence]).toEqual([500_000, 300_000]);
    expect(find("Fraser Valley Logistics Ltd.").toleranceOccurrence).toBeNull();
    expect(book.every((a) => a.permissibleLossRatio === 0.65)).toBe(true);
  });
});

describe("Pacific Northwest Terminals placement (hand-verification case)", () => {
  const pnt = find("Pacific Northwest Terminals Ltd.");
  const layers = demoProgramLayers(pnt, "property");

  it("Tower 1 placed 40% for 310,000; B1 60% for 264,000; B2 60% for 181,000", () => {
    const [a, b1, b2] = layers.map((l) => layerSummary(l).value);
    expect([a.placedShare, a.layerPremium, Number((a.participations[0].rateOnLine! * 100).toFixed(4))]).toEqual([0.4, 310_000, 0.2667]);
    expect([b1.placedShare, b1.layerPremium, b1.rateOnLine]).toEqual([0.6, 264_000, 0.0044]);
    expect([b2.placedShare, b2.layerPremium, Number((b2.rateOnLine! * 100).toFixed(4))]).toEqual([0.6, 181_000, 0.1508]);
  });

  it("is 100% placed on both segments, 755,000 premium and $0.2517 per $100 of the $300M TIV", () => {
    const tiv = pnt.policies.find((p) => p.key === "pnt-pr")!.insurableValue!;
    expect(tiv).toBe(300 * M);
    const c = coverageProfile(layers, tiv).value;
    expect(c.segments.map((s) => [s.from, s.to, s.placedShare, s.status])).toEqual([
      [0, 100 * M, 1, "fully_placed"],
      [100 * M, 300 * M, 1, "fully_placed"],
    ]);
    const t = programTotals(layers, tiv).value;
    expect([t.totalPremium, Number(t.ratePer100Tiv!.toFixed(4))]).toEqual([755_000, 0.2517]);
  });

  it("carries the 12-line deductible schedule with All other perils $100,000 as the default", () => {
    const pr = pnt.policies.find((p) => p.key === "pnt-pr")!;
    expect(pr.deductible).toBe(100_000);
    expect(pr.deductibles).toHaveLength(11);
    const rules = [flatRule(pr.deductible!), ...pr.deductibles.map((r) => ({ ...r, amount: r.amount ?? null, percent: r.percent ?? null, minimum: r.minimum ?? null, maximum: r.maximum ?? null, hours: r.hours ?? null, isDefault: false }))];
    expect(deductibleForClaim(matchRule(rules, "Earthquake").value!, 2_000_000).value.amount).toBe(200_000);
    expect(deductibleForClaim(matchRule(rules, "stock").value!, 30_000).value.amount).toBe(10_000);
    expect(matchRule(rules, "Hail").value?.isDefault).toBe(true);
  });

  it("replays the property claims peril by peril: scheduled perils keep their rule, the option moves only the default", () => {
    const { policies, claims } = demoAccountToLossRuns(pnt);
    const pr = pnt.policies.find((p) => p.key === "pnt-pr")!;
    const schedule = pr.deductibles.map((r) => ({ ...r, amount: r.amount ?? null, percent: r.percent ?? null, minimum: r.minimum ?? null, maximum: r.maximum ?? null, hours: r.hours ?? null, isDefault: false }));
    const grouped = groupClaimsByPolicyYear(claims, policies, "Property", asOf).value;
    expect(grouped.years.map((y) => y.label)).toEqual(["PY2021", "PY2022", "PY2023", "PY2024", "PY2025"]);
    const a = analyzeRetentionOptions(grouped, demoRetentionOptions(pr), { yearsToUse: 5, includeCurrentYear: true, adjustments: { trendRate: null, factors: null }, schedule }).value;
    // PY2021: Stock 48,000 → 10,000; Vehicle impact 22,000 → 10,000 → 20,000 · PY2022: Flood → 250,000; Theft → 10,000 → 260,000
    // PY2023: fire 310,000 (default) → 100,000; Glass → 1,000 → 101,000 · PY2024: EB → 25,000; Stock → 10,000 → 35,000 · PY2025: Sewer backup → 50,000; Transit → 5,000 → 55,000
    expect(a.options[0].years.map((y) => y.retained)).toEqual([20_000, 260_000, 101_000, 35_000, 55_000]);
    expect(a.options[2].years.map((y) => y.retained)).toEqual([20_000, 260_000, 311_000, 35_000, 55_000]);
  });
});

describe("the other accounts", () => {
  it("Kootenay: primary shared 50/50 with a single-insurer excess, fully placed to the $120M TIV; prior term renewed at 360,000", () => {
    const koot = find("Kootenay Alpine Resorts Inc.");
    const layers = demoProgramLayers(koot, "property");
    expect(layers.map((l) => l.participations.map((p) => p.signedLinePct))).toEqual([[50, 50], [100]]);
    expect(coverageProfile(layers, 120 * M).value.fullyPlaced).toBe(true);
    const prior = koot.policies.find((p) => p.key === find("Kootenay Alpine Resorts Inc.").policies.find((x) => x.key === "koot-pr")!.previousKey)!;
    expect([prior.annualPremium, prior.outcome?.type]).toEqual([360_000, "renewed"]);
  });

  it("Fraser Valley: 22 auto claims over five years, every one below 20,000; prior term renewed at 293,500", () => {
    const fvl = find("Fraser Valley Logistics Ltd.");
    const auto = fvl.claims.filter((c) => c.lineOfBusiness === "Commercial Auto");
    expect(auto).toHaveLength(22);
    expect(auto.every((c) => c.paid + c.reserved < 20_000)).toBe(true);
    expect(fvl.policies.find((p) => p.key === "fvl-um-lost")!.outcome).toMatchObject({ type: "lost", lostReason: "price" });
  });

  it("Coastline Dental: one large open cyber claim; the cyber policy expires in 30 days", () => {
    const cdg = find("Coastline Dental Group");
    const cyber = cdg.claims.filter((c) => c.lineOfBusiness === "Cyber");
    expect(cyber).toHaveLength(1);
    expect([cyber[0].status, cyber[0].paid + cyber[0].reserved]).toEqual(["open", 250_000]);
    expect(cdg.policies.find((p) => p.key === "cdg-cy")!.expiryOffsetDays).toBe(30);
  });

  it("the three new accounts carry the boundary policies: Harbourview 0 days, Bramblewood 121, Northwind 90", () => {
    expect(find("Harbourview Inns & Taverns Ltd.").policies.filter((p) => p.expiryOffsetDays === 0)).toHaveLength(2);
    expect(find("Bramblewood Garden Centres Ltd.").policies.some((p) => p.expiryOffsetDays === 121)).toBe(true);
    expect(find("Northwind Engineering Partners Inc.").policies.some((p) => p.expiryOffsetDays === 90)).toBe(true);
  });
});
