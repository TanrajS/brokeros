import { describe, expect, it } from "vitest";
import {
  bookTiles,
  concentration,
  expiringByMonth,
  filterByProducer,
  forwardWindow,
  isInForce,
  lookbackWindow,
  resolutionOf,
  retention,
  revenueForecast,
  topExpiring,
  type DashAccount,
  type DashPolicy,
} from "../dashboard";

const asOf = "2026-11-12";

function pol(id: string, over: Partial<DashPolicy>): DashPolicy {
  return {
    id,
    accountId: "a1",
    lineOfBusiness: "General Liability",
    carrier: "Northgate Mutual",
    effectiveDate: "2026-01-01",
    expiryDate: "2027-01-01",
    annualPremium: 10_000,
    commissionRate: 10,
    renewalStatus: "not_started",
    outcome: null,
    checklist: { done: 0, total: 4 },
    ...over,
  };
}
const renewedTo = (successorPolicyId: string | null) =>
  ({ type: "renewed", lostReason: null, reason: null, competingPremium: null, successorPolicyId }) as const;

const accounts: DashAccount[] = [
  { id: "a1", name: "Alpha Ltd.", producer: "Dana" },
  { id: "a2", name: "Beta Inc.", producer: "Dana" },
  { id: "a3", name: "Gamma Corp.", producer: "Marcus" },
  { id: "a4", name: "Delta LLP", producer: null },
];

describe("windows", () => {
  it("lookback ends on the as-of date and starts the day after as-of − N months", () => {
    // 2026-11-12 − 12 months = 2025-11-12, + 1 day = 2025-11-13
    expect(lookbackWindow(asOf, 12).value).toEqual({ start: "2025-11-13", end: "2026-11-12", months: 12 });
    // − 6 months = 2026-05-12, + 1 day = 2026-05-13
    expect(lookbackWindow(asOf, 6).value.start).toBe("2026-05-13");
    // − 24 months = 2024-11-12, + 1 day = 2024-11-13
    expect(lookbackWindow(asOf, 24).value.start).toBe("2024-11-13");
  });
  it("forward starts the day after as-of and ends as-of + N months", () => {
    // 2026-11-12 + 1 day = 2026-11-13; + 12 months = 2027-11-12
    expect(forwardWindow(asOf, 12).value).toEqual({ start: "2026-11-13", end: "2027-11-12", months: 12 });
    expect(forwardWindow(asOf, 3).value.end).toBe("2027-02-12"); // Nov + 3 = Feb
    expect(forwardWindow(asOf, 6).value.end).toBe("2027-05-12"); // Nov + 6 = May
  });
});

describe("filterByProducer", () => {
  const policies = [pol("p1", { accountId: "a1" }), pol("p2", { accountId: "a3" }), pol("p3", { accountId: "a2" })];
  it("keeps one producer's accounts and their policies", () => {
    const r = filterByProducer(accounts, policies, "Dana").value;
    // Dana has a1 and a2 → 2 of 4 accounts; p1 (a1) and p3 (a2)
    expect(r.shownAccounts).toBe(2);
    expect(r.totalAccounts).toBe(4);
    expect(r.policies.map((p) => p.id)).toEqual(["p1", "p3"]);
  });
  it("keeps everything with no producer selected", () => {
    expect(filterByProducer(accounts, policies, null).value.policies).toHaveLength(3);
  });
});

describe("bookTiles", () => {
  const policies = [
    pol("p1", { accountId: "a1", effectiveDate: "2026-01-01", expiryDate: "2027-01-01", annualPremium: 100_000, commissionRate: 15 }),
    pol("p2", { accountId: "a1", effectiveDate: "2026-06-01", expiryDate: "2027-06-01", annualPremium: 50_000, commissionRate: 10 }),
    // expires on the as-of date → not in force (as-of < expiry is false)
    pol("p3", { accountId: "a3", effectiveDate: "2025-11-12", expiryDate: "2026-11-12", annualPremium: 70_000 }),
    // starts on the as-of date → in force (effective ≤ as-of)
    pol("p4", { accountId: "a2", effectiveDate: "2026-11-12", expiryDate: "2027-11-12", annualPremium: 30_000, commissionRate: 12.5 }),
    // lost → excluded even though dates are in force
    pol("p5", { accountId: "a4", renewalStatus: "lost", annualPremium: 20_000 }),
    // starts tomorrow → not yet in force
    pol("p6", { accountId: "a4", effectiveDate: "2026-11-13", expiryDate: "2027-11-13", annualPremium: 5_000 }),
  ];
  it("applies effective ≤ as-of < expiry and skips lost/non-renewed", () => {
    expect(policies.filter((p) => isInForce(p, asOf)).map((p) => p.id)).toEqual(["p1", "p2", "p4"]);
  });
  it("totals premium, commission and the premium-weighted rate", () => {
    const r = bookTiles(policies, asOf).value;
    // 100,000 + 50,000 + 30,000 = 180,000
    expect(r.inForcePremium).toBe(180_000);
    expect(r.inForceCount).toBe(3);
    // a1 (p1, p2) and a2 (p4) → 2
    expect(r.activeAccounts).toBe(2);
    // 100,000 × 15% = 15,000; 50,000 × 10% = 5,000; 30,000 × 12.5% = 3,750 → 23,750
    expect(r.bookedCommission).toBe(23_750);
    // 23,750 ÷ 180,000 = 0.131944…
    expect(Number(r.averageCommissionRate!.toFixed(6))).toBe(0.131944);
  });
  it("returns no rate rather than dividing by zero", () => {
    const r = bookTiles([], asOf).value;
    expect(r).toEqual({ inForcePremium: 0, inForceCount: 0, activeAccounts: 0, bookedCommission: 0, averageCommissionRate: null });
  });
});

describe("retention", () => {
  const window = lookbackWindow(asOf, 12).value; // 2025-11-13 to 2026-11-12
  const policies = [
    pol("A", { expiryDate: "2026-03-01", annualPremium: 100_000, renewalStatus: "renewed", outcome: renewedTo("S1") }),
    pol("S1", { effectiveDate: "2026-03-01", expiryDate: "2027-03-01", annualPremium: 110_000 }),
    pol("B", {
      accountId: "a2",
      expiryDate: "2026-06-01",
      annualPremium: 40_000,
      renewalStatus: "lost",
      outcome: { type: "lost", lostReason: "price", reason: null, competingPremium: 32_000, successorPolicyId: null },
    }),
    pol("C", {
      expiryDate: "2026-09-01",
      annualPremium: 20_000,
      renewalStatus: "non_renewed",
      outcome: { type: "non_renewed", lostReason: null, reason: "Carrier exiting class", competingPremium: null, successorPolicyId: null },
    }),
    // expired with no outcome → unresolved, treated as lost
    pol("D", { expiryDate: "2026-10-01", annualPremium: 40_000, renewalStatus: "in_progress" }),
    // expiry 2025-11-12 is one day before the window start → outside
    pol("E", { expiryDate: "2025-11-12", annualPremium: 999, renewalStatus: "renewed", outcome: renewedTo(null) }),
    // lost early but expires after the as-of date → excluded, counted
    pol("F", { expiryDate: "2026-12-20", annualPremium: 5_000, renewalStatus: "lost", outcome: { type: "lost", lostReason: "service", reason: null, competingPremium: null, successorPolicyId: null } }),
  ];

  it("classifies resolutions", () => {
    expect(resolutionOf(policies[0])).toBe("renewed");
    expect(resolutionOf(policies[4])).toBe("unresolved");
  });

  it("computes count, premium and renewed-premium ratios", () => {
    const r = retention(policies, accounts, window, asOf).value;
    // resolved: A, B, C, D = 4 (S1 and F not expired, E outside window)
    expect(r.resolvedCount).toBe(4);
    expect([r.renewedCount, r.lostCount, r.nonRenewedCount, r.unresolvedCount]).toEqual([1, 1, 1, 1]);
    // count retention = 1 ÷ 4 = 0.25
    expect(r.countRetention).toBe(0.25);
    // resolved premium = 100,000 + 40,000 + 20,000 + 40,000 = 200,000
    expect(r.resolvedPremium).toBe(200_000);
    // premium retention = 100,000 ÷ 200,000 = 0.5
    expect(r.premiumRetention).toBe(0.5);
    // renewed premium ratio = successor 110,000 ÷ 200,000 = 0.55
    expect(r.renewedPremiumRatio).toBe(0.55);
    // F has an outcome but expires 2026-12-20, after the as-of date
    expect(r.excludedNotYetExpired).toBe(1);
  });

  it("lists lost business largest first, including unresolved", () => {
    const rows = retention(policies, accounts, window, asOf).value.lostRows;
    // B 40,000 and D 40,000 tie, then C 20,000
    expect(rows.map((x) => [x.policyId, x.resolution])).toEqual([
      ["B", "lost"],
      ["D", "unresolved"],
      ["C", "non_renewed"],
    ]);
    expect(rows[0]).toMatchObject({ accountName: "Beta Inc.", lostReason: "price", competingPremium: 32_000 });
  });

  it("can exceed 100% when renewal premium grows", () => {
    // 100,000 renewed into 130,000 with nothing lost → 130,000 ÷ 100,000 = 1.3
    const r = retention(
      [pol("A", { expiryDate: "2026-03-01", annualPremium: 100_000, renewalStatus: "renewed", outcome: renewedTo("S") }), pol("S", { annualPremium: 130_000 })],
      accounts,
      window,
      asOf,
    ).value;
    expect(r.renewedPremiumRatio).toBe(1.3);
    expect(r.premiumRetention).toBe(1);
  });

  it("counts a missing successor as $0 and says so", () => {
    const r = retention([pol("A", { expiryDate: "2026-03-01", annualPremium: 100_000, renewalStatus: "renewed", outcome: renewedTo("gone") })], accounts, window, asOf).value;
    expect(r.successorPremium).toBe(0);
    expect(r.successorsMissing).toBe(1);
  });

  it("returns nulls, not NaN, with nothing resolved", () => {
    const r = retention([], accounts, window, asOf).value;
    expect([r.countRetention, r.premiumRetention, r.renewedPremiumRatio]).toEqual([null, null, null]);
  });
});

describe("expiringByMonth", () => {
  const window = forwardWindow(asOf, 3).value; // 2026-11-13 to 2027-02-12
  it("buckets open policies by expiry month, zeros included", () => {
    const r = expiringByMonth(
      [
        pol("x", { expiryDate: "2026-11-12", annualPremium: 1_000 }), // the as-of date → not in the forward window
        pol("a", { expiryDate: "2026-11-20", annualPremium: 50_000 }),
        pol("b", { expiryDate: "2026-12-31", annualPremium: 25_000 }),
        pol("c", { expiryDate: "2027-02-12", annualPremium: 10_000 }), // last day of the window → in
        pol("d", { expiryDate: "2027-02-13", annualPremium: 7_000 }), // one day after → out
        pol("e", { expiryDate: "2026-12-01", annualPremium: 9_000, renewalStatus: "renewed", outcome: renewedTo(null) }), // closed → out
      ],
      window,
    ).value;
    // Nov 2026 … Feb 2027 = 4 months
    expect(r.map((b) => [b.month, b.count, b.premium])).toEqual([
      ["2026-11", 1, 50_000],
      ["2026-12", 1, 25_000],
      ["2027-01", 0, 0],
      ["2027-02", 1, 10_000],
    ]);
    expect(r[0].label).toBe("Nov 2026");
  });
  it("covers 13 calendar months for a 12-month window that starts mid-month", () => {
    // 2026-11-13 to 2027-11-12 touches Nov 2026 through Nov 2027
    expect(expiringByMonth([], forwardWindow(asOf, 12).value).value).toHaveLength(13);
  });
});

describe("topExpiring", () => {
  it("sorts by premium, keeps N, and reports days and readiness", () => {
    const window = forwardWindow(asOf, 12).value;
    const rows = topExpiring(
      [
        pol("small", { expiryDate: "2026-12-12", annualPremium: 5_000 }),
        pol("big", { accountId: "a2", expiryDate: "2027-01-11", annualPremium: 150_000, checklist: { done: 2, total: 4 } }),
        pol("mid", { expiryDate: "2026-12-12", annualPremium: 60_000 }),
      ],
      accounts,
      window,
      asOf,
      2,
    ).value;
    expect(rows.map((r) => r.policyId)).toEqual(["big", "mid"]);
    // 2026-11-12 → 2027-01-11 = 18 + 31 + 11 = 60 days
    expect(rows[0].daysToExpiry).toBe(60);
    expect(rows[0].readiness.label).toBe("2 of 4 ready");
    expect(rows[0].accountName).toBe("Beta Inc.");
  });
});

describe("revenueForecast", () => {
  const window = forwardWindow(asOf, 12).value;
  const two = [
    pol("p100", { expiryDate: "2027-01-01", annualPremium: 100_000, commissionRate: 15 }),
    pol("p50", { expiryDate: "2027-02-01", annualPremium: 50_000, commissionRate: 10 }),
  ];

  it("matches the specified example", () => {
    const r = revenueForecast(two, accounts, window, { retention: 0.875, rateChange: 0 }).value;
    // 100,000 × 0.875 × 1 × 0.15 = 13,125
    expect(r.base.contributions[0].commission).toBeCloseTo(13_125, 6);
    // 50,000 × 0.875 × 1 × 0.10 = 4,375
    expect(r.base.contributions[1].commission).toBeCloseTo(4_375, 6);
    // 13,125 + 4,375 = 17,500
    expect(r.base.commission).toBe(17_500);
    expect(r.expiringPremium).toBe(150_000);
  });

  it("builds low and high scenarios ±10 retention points and ±5 rate points", () => {
    const r = revenueForecast(two, accounts, window, { retention: 0.875, rateChange: 0 }).value;
    // low: 0.775, −5%: 100,000 × 0.775 × 0.95 × 0.15 = 11,043.75; 50,000 × 0.775 × 0.95 × 0.10 = 3,681.25 → 14,725
    expect(r.low.commission).toBe(14_725);
    // high: 0.975, +5%: 100,000 × 0.975 × 1.05 × 0.15 = 15,356.25; 50,000 × 0.975 × 1.05 × 0.10 = 5,118.75 → 20,475
    expect(r.high.commission).toBe(20_475);
  });

  it("caps high retention at 100%", () => {
    const r = revenueForecast(two, accounts, window, { retention: 0.95, rateChange: 0 }).value;
    // 0.95 + 0.10 = 1.05 → capped at 1.00: 100,000 × 1 × 1.05 × 0.15 = 15,750; 50,000 × 1 × 1.05 × 0.10 = 5,250 → 21,000
    expect(r.high.retention).toBe(1);
    expect(r.high.commission).toBe(21_000);
  });

  it("ignores closed policies and policies outside the window", () => {
    const r = revenueForecast(
      [...two, pol("closed", { renewalStatus: "lost", outcome: { type: "lost", lostReason: "price", reason: null, competingPremium: null, successorPolicyId: null } }), pol("late", { expiryDate: "2028-01-01" })],
      accounts,
      window,
      { retention: 0.875, rateChange: 0 },
    ).value;
    expect(r.policyCount).toBe(2);
    expect(r.base.commission).toBe(17_500);
  });

  it("forecasts zero, not NaN, with no expiring policies", () => {
    expect(revenueForecast([], accounts, window, { retention: 0.85, rateChange: 0 }).value.base.commission).toBe(0);
  });
});

describe("concentration", () => {
  const policies = [
    pol("1", { accountId: "a1", carrier: "X", annualPremium: 40_000 }),
    pol("2", { accountId: "a2", carrier: "X", annualPremium: 30_000, lineOfBusiness: "Property" }),
    pol("3", { accountId: "a3", carrier: "Y", annualPremium: 20_000 }),
    pol("4", { accountId: "a4", carrier: "Z", annualPremium: 10_000, lineOfBusiness: "Cyber" }),
    pol("5", { accountId: "a4", carrier: "Z", annualPremium: 99_000, renewalStatus: "lost" }), // not in force
  ];
  it("computes shares of in-force premium and flags above the thresholds", () => {
    const r = concentration(policies, accounts, asOf).value;
    // total = 40,000 + 30,000 + 20,000 + 10,000 = 100,000
    expect(r.totalPremium).toBe(100_000);
    // X = 70,000 ÷ 100,000 = 0.70 > 0.35 → flagged; Y 0.20; Z 0.10
    expect(r.byCarrier.map((x) => [x.label, x.share, x.flagged])).toEqual([
      ["X", 0.7, true],
      ["Y", 0.2, false],
      ["Z", 0.1, false],
    ]);
    // GL = 40,000 + 20,000 = 60,000 → 0.6; Property 0.3; Cyber 0.1
    expect(r.byLine.map((x) => [x.label, x.share])).toEqual([
      ["General Liability", 0.6],
      ["Property", 0.3],
      ["Cyber", 0.1],
    ]);
    // accounts: 0.40, 0.30, 0.20 are > 0.15; 0.10 is not
    expect(r.flaggedAccounts.map((x) => x.label)).toEqual(["Alpha Ltd.", "Beta Inc.", "Gamma Corp."]);
  });
  it("does not flag a share exactly at the threshold", () => {
    // 35,000 ÷ 100,000 = 0.35, not above 0.35
    const r = concentration([pol("a", { carrier: "X", annualPremium: 35_000 }), pol("b", { carrier: "Y", annualPremium: 65_000 })], accounts, asOf).value;
    expect(r.byCarrier.find((x) => x.label === "X")!.flagged).toBe(false);
  });
  it("returns empty tables for an empty book", () => {
    const r = concentration([], accounts, asOf).value;
    expect(r.totalPremium).toBe(0);
    expect(r.byCarrier).toEqual([]);
  });
});
