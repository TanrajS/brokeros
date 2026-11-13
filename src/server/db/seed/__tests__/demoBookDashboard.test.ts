import { describe, expect, it } from "vitest";
import { bookTiles, concentration, forwardWindow, lookbackWindow, retention, revenueForecast } from "@/lib/domain/dashboard";
import { buildDemoBook } from "../demoBookData";
import { demoBookToDashboard } from "../demoBookDashboard";

const asOf = "2026-11-12";
const { accounts, policies } = demoBookToDashboard(buildDemoBook(asOf));

describe("demo book through the dashboard", () => {
  it("has exactly 10 resolved renewals in the trailing 12 months: 87.5% premium, 80.0% count retention", () => {
    const r = retention(policies, accounts, lookbackWindow(asOf, 12).value, asOf).value;
    // 8 renewed + 1 lost + 1 non-renewed = 10, none unresolved
    expect([r.resolvedCount, r.renewedCount, r.lostCount, r.nonRenewedCount, r.unresolvedCount]).toEqual([10, 8, 1, 1, 0]);
    // renewed: 100,000 + 71,500 + 38,700 + 52,100 + 380,000 + 352,000 + 69,500 + 21,200 = 1,085,000
    expect(r.renewedExpiringPremium).toBe(1_085_000);
    // + lost 58,800 + non-renewed 96,200 = 1,240,000
    expect(r.resolvedPremium).toBe(1_240_000);
    // 1,085,000 ÷ 1,240,000 = 0.875
    expect(r.premiumRetention).toBe(0.875);
    // 8 ÷ 10 = 0.80
    expect(r.countRetention).toBe(0.8);
    // Lantern Hill's auto was lost but expires in 45 days → excluded until it expires
    expect(r.excludedNotYetExpired).toBe(1);
  });

  it("puts one carrier at about 40% of in-force premium, so the concentration flag shows", () => {
    const c = concentration(policies, accounts, asOf).value;
    expect(c.flaggedCarriers.map((x) => x.label)).toEqual(["Dominion Shield Insurance"]);
    // 1,226,500 ÷ 3,091,800 = 0.39669…
    expect(Number(c.flaggedCarriers[0].share.toFixed(4))).toBe(0.3967);
  });

  it("computes book tiles and a forecast without NaN", () => {
    const b = bookTiles(policies, asOf).value;
    expect(b.inForcePremium).toBe(3_091_800);
    expect(Number.isFinite(b.averageCommissionRate)).toBe(true);
    const f = revenueForecast(policies, accounts, forwardWindow(asOf, 12).value, { retention: 0.875, rateChange: 0 }).value;
    expect(f.policyCount).toBeGreaterThan(30);
    expect(f.low.commission).toBeLessThan(f.base.commission);
    expect(f.high.commission).toBeGreaterThan(f.base.commission);
  });
});
