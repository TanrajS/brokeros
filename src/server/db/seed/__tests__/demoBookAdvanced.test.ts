import { describe, expect, it } from "vitest";
import { bookTiles, lookbackWindow, retention } from "@/lib/domain/dashboard";
import { deductibleForClaim, flatRule, matchRule } from "@/lib/domain/deductibles";
import { coverageProfile, layerSummary, programTotals } from "@/lib/domain/program";
import { analyzeRetentionOptions, groupClaimsByPolicyYear } from "@/lib/domain/strategy";
import { buildDemoBook, buildFullDemoBook } from "../demoBookData";
import { demoBookToDashboard } from "../demoBookDashboard";
import { demoAccountToLossRuns } from "../demoBookLossRuns";
import { demoProgramLayers } from "../demoBookProgram";
import { demoRetentionOptions } from "../demoBookStrategy";

const asOf = "2026-11-12";
const book = buildFullDemoBook(asOf);
const base = buildDemoBook(asOf);
const find = (name: string) => book.find((a) => a.name === name)!;
const M = 1_000_000;

describe("v1.3 demo book", () => {
  it("has at least 19 accounts, five of them new, on top of the unchanged 14-account base", () => {
    expect(book.length).toBeGreaterThanOrEqual(19);
    expect(book.length - base.length).toBe(5);
    expect(base.map((a) => a.name)).toEqual(book.slice(0, base.length).map((a) => a.name));
    for (const name of ["Pacific Northwest Terminals Ltd.", "Kootenay Alpine Resorts Inc.", "Fraser Valley Logistics Ltd.", "Summit Ridge Builders Inc.", "Coastline Dental Group"]) {
      const a = find(name);
      expect(a).toBeDefined();
      expect(a.requirements.length).toBeGreaterThanOrEqual(1);
      expect(a.certificates.length).toBeGreaterThanOrEqual(1);
      const marketed = a.policies.find((p) => p.submissions.length > 0)!;
      expect(marketed.submissions.length).toBeGreaterThanOrEqual(3);
      expect(marketed.submissions.length).toBeLessThanOrEqual(5);
      expect(marketed.submissions.some((s) => s.quotes.length > 0)).toBe(true);
      expect(a.policies.some((p) => p.retentionOptions.length === 3)).toBe(true);
    }
  });

  it("keeps every new policy out of the trailing-12-month resolved set", () => {
    const { accounts, policies } = demoBookToDashboard(book);
    const window = lookbackWindow(asOf, 12).value;
    const newNames = new Set(["Pacific Northwest Terminals Ltd.", "Kootenay Alpine Resorts Inc.", "Fraser Valley Logistics Ltd.", "Summit Ridge Builders Inc.", "Coastline Dental Group"]);
    const inWindow = policies.filter((p) => newNames.has(p.accountId) && p.expiryDate >= window.start && p.expiryDate <= asOf);
    expect(inWindow).toEqual([]);
    const r = retention(policies, accounts, window, asOf).value;
    expect([r.countRetention, r.premiumRetention]).toEqual([0.8, 0.875]);
    // the new accounts are in force (their current terms run past the as-of date)
    const tiles = bookTiles(policies, asOf).value;
    expect(tiles.activeAccounts).toBeGreaterThanOrEqual(17);
  });

  it("Fraser Valley's lost umbrella sits outside the 12-month window and inside the 24-month one", () => {
    const { accounts, policies } = demoBookToDashboard(book);
    const twelve = retention(policies, accounts, lookbackWindow(asOf, 12).value, asOf).value;
    const twentyFour = retention(policies, accounts, lookbackWindow(asOf, 24).value, asOf).value;
    expect(twelve.lostRows.some((r) => r.accountName === "Fraser Valley Logistics Ltd.")).toBe(false);
    expect(twentyFour.lostRows.filter((r) => r.resolution === "lost").map((r) => r.accountName).sort()).toEqual(["Fraser Valley Logistics Ltd.", "Prairie Loop Logistics Inc."]);
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
    // Earthquake 10% of loss, minimum 100,000: a 2,000,000 loss → 200,000
    expect(deductibleForClaim(matchRule(rules, "Earthquake").value!, 2_000_000).value.amount).toBe(200_000);
    // Stock flat 10,000 on a 30,000 loss → 10,000; Theft → 10,000; an unlisted peril → the 100,000 default
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
    const at100k = a.options[0];
    // PY2021: Stock 48,000 → min(48,000, 10,000) = 10,000; Vehicle impact 22,000 → 10,000 → 20,000
    // PY2022: Flood 1,850,000 → 250,000; Theft 14,000 → 10,000 → 260,000
    // PY2023: fire 310,000 (default) → 100,000; Glass 3,200 → 1,000 → 101,000
    // PY2024: Equipment breakdown 96,000 → 25,000; Stock 27,500 → 10,000 → 35,000
    // PY2025: Sewer backup 61,000 → 50,000; Transit 8,900 → 5,000 → 55,000
    expect(at100k.years.map((y) => y.retained)).toEqual([20_000, 260_000, 101_000, 35_000, 55_000]);
    // at $500,000 only the PY2023 fire (default peril) moves: 100,000 → 310,000
    expect(a.options[2].years.map((y) => y.retained)).toEqual([20_000, 260_000, 311_000, 35_000, 55_000]);
    expect(a.options[0].years.every((y) => y.excludedClaims.length === 0)).toBe(true);
  });
});

describe("the other new accounts", () => {
  it("Kootenay: primary shared 50/50 with a single-insurer excess, fully placed to the $120M TIV", () => {
    const koot = find("Kootenay Alpine Resorts Inc.");
    const layers = demoProgramLayers(koot, "property");
    expect(layers.map((l) => l.participations.map((p) => p.signedLinePct))).toEqual([[50, 50], [100]]);
    const c = coverageProfile(layers, 120 * M).value;
    expect(c.fullyPlaced).toBe(true);
    const eq = koot.policies.find((p) => p.key === "koot-pr")!.deductibles.find((r) => r.appliesTo === "Earthquake")!;
    expect([eq.kind, eq.percent, eq.minimum]).toEqual(["percent_of_value", 10, 250_000]);
  });

  it("Fraser Valley: 22 auto claims over five years, every one below 20,000", () => {
    const fvl = find("Fraser Valley Logistics Ltd.");
    const auto = fvl.claims.filter((c) => c.lineOfBusiness === "Commercial Auto");
    expect(auto).toHaveLength(22);
    expect(auto.every((c) => c.paid + c.reserved < 20_000)).toBe(true);
    expect(fvl.policies.find((p) => p.key === "fvl-um-lost")!.outcome).toMatchObject({ type: "lost", lostReason: "price" });
  });

  it("Summit Ridge: the $5M umbrella falls short of the $10M contract and the wrap-up certificate is still requested", () => {
    const srb = find("Summit Ridge Builders Inc.");
    const umbrella = srb.towerLayers.find((t) => t.layerType === "umbrella")!;
    expect(umbrella.limit).toBe(5 * M);
    expect(srb.requirements.find((r) => r.coverage === "Umbrella/Excess")!.requiredOccurrence).toBe(10 * M);
    expect(srb.certificates[0].issuedOnOffset).toBeNull();
  });

  it("Coastline Dental: one large open cyber claim and a cheaper quote with a lower aggregate", () => {
    const cdg = find("Coastline Dental Group");
    const cyber = cdg.claims.filter((c) => c.lineOfBusiness === "Cyber");
    expect(cyber).toHaveLength(1);
    expect([cyber[0].status, cyber[0].paid + cyber[0].reserved]).toEqual(["open", 250_000]);
    const quotes = cdg.policies.find((p) => p.key === "cdg-cy")!.submissions.flatMap((s) => s.quotes);
    const cheapest = [...quotes].sort((a, b) => a.premium - b.premium)[0];
    expect([cheapest.premium, cheapest.aggregateLimit]).toEqual([17_800, 500_000]);
  });
});
