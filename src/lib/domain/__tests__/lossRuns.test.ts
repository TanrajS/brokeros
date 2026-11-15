import { describe, expect, it } from "vitest";
import {
  IMPORT_COLUMNS,
  adjustIncurred,
  assignPolicyYear,
  checkImportColumns,
  claimFlags,
  developmentAge,
  incurred,
  largeLosses,
  matchLine,
  openClaims,
  policyPeriods,
  policyYearSummary,
  trendFactor,
  validateImportRows,
  type LRClaim,
  type LRPolicy,
} from "../lossRuns";

const asOf = "2026-11-12";

function policy(id: string, over: Partial<LRPolicy>): LRPolicy {
  return {
    id,
    lineOfBusiness: "General Liability",
    effectiveDate: "2026-01-11",
    expiryDate: "2027-01-11",
    annualPremium: 100_000,
    exposureBasis: "revenue",
    exposureAmount: 20_000_000,
    previousPolicyId: null,
    ...over,
  };
}
function claim(id: string, over: Partial<LRClaim>): LRClaim {
  return {
    id,
    lineOfBusiness: "General Liability",
    claimNumber: id,
    dateOfLoss: "2026-03-01",
    dateReported: "2026-03-05",
    description: null,
    paid: 0,
    reserved: 0,
    status: "closed",
    policyId: null,
    ...over,
  };
}

describe("incurred", () => {
  it("is paid plus reserved", () => {
    // 30,000 + 90,000 = 120,000
    expect(incurred(30_000, 90_000).value).toBe(120_000);
    // 0.10 + 0.20 = 0.30 (no float drift)
    expect(incurred(0.1, 0.2).value).toBe(0.3);
  });
  it("rejects negatives", () => {
    expect(() => incurred(-1, 0)).toThrow();
  });
});

describe("policyPeriods and assignPolicyYear", () => {
  const policies = [
    policy("p26", { effectiveDate: "2026-01-11", expiryDate: "2027-01-11", previousPolicyId: "p25" }),
    policy("p25", { effectiveDate: "2025-01-11", expiryDate: "2026-01-11", previousPolicyId: "p24" }),
    // predecessor recorded under another line: still part of the chain through the link
    policy("p24", { lineOfBusiness: "Umbrella/Excess", effectiveDate: "2024-01-11", expiryDate: "2025-01-11" }),
    policy("prop", { lineOfBusiness: "Property" }),
  ];
  const periods = policyPeriods(policies, "General Liability").value;

  it("follows previous_policy_id links, oldest first, labelled by effective year", () => {
    expect(periods.map((p) => p.label)).toEqual([
      "PY2024: 2024-01-11 to 2025-01-11",
      "PY2025: 2025-01-11 to 2026-01-11",
      "PY2026: 2026-01-11 to 2027-01-11",
    ]);
  });

  it("assigns by effective ≤ loss < expiry", () => {
    expect(assignPolicyYear({ dateOfLoss: "2025-01-11", policyId: null }, periods).value?.year).toBe(2025); // effective day → that year
    expect(assignPolicyYear({ dateOfLoss: "2026-01-11", policyId: null }, periods).value?.year).toBe(2026); // expiry day belongs to the next term
    expect(assignPolicyYear({ dateOfLoss: "2026-01-10", policyId: null }, periods).value?.year).toBe(2025);
    expect(assignPolicyYear({ dateOfLoss: "2023-12-31", policyId: null }, periods).value).toBeNull(); // before any period
  });

  it("prefers the linked policy when periods overlap", () => {
    const overlap = [...periods, { ...periods[2], policyId: "dup", label: "PY2026 duplicate" }];
    expect(assignPolicyYear({ dateOfLoss: "2026-05-01", policyId: "p26" }, overlap).value?.policyId).toBe("p26");
    expect(assignPolicyYear({ dateOfLoss: "2026-05-01", policyId: null }, overlap).value?.policyId).toBe("dup"); // latest listed
  });
});

describe("developmentAge", () => {
  it.each([
    // Jan 11 → Nov 12 2026: 10 months, 12 ≥ 11 so no adjustment → under 12 → bucket 12
    ["2026-01-11", 10, "12"],
    // 2025-01-11 → 22 months → bucket down to 12
    ["2025-01-11", 22, "12"],
    // 34 months → 24
    ["2024-01-11", 34, "24"],
    // 46 → 36
    ["2023-01-11", 46, "36"],
    // 58 → 48
    ["2022-01-11", 58, "48"],
    // 70 → 60+
    ["2021-01-11", 70, "60+"],
    // 2025-11-13 → 2026-11-12: 12 months minus 1 because the 12th is before the 13th → 11
    ["2025-11-13", 11, "12"],
  ] as const)("%s → %i months, bucket %s", (effective, months, bucket) => {
    expect(developmentAge(effective, asOf).value).toEqual({ months, bucket });
  });
});

describe("trend and development", () => {
  it("matches the specified example", () => {
    // (1 + 0.05) ^ (2027 − 2025) = 1.05² = 1.1025
    const t = trendFactor(0.05, 2025, 2027).value;
    expect(t.exponent).toBe(2);
    expect(t.factor).toBeCloseTo(1.1025, 10);
    // 100,000 × 1.1025 = 110,250
    expect(adjustIncurred(100_000, t.factor, 1).value).toBe(110_250);
    // 110,250 × 1.15 = 126,787.50
    expect(adjustIncurred(100_000, t.factor, 1.15).value).toBe(126_787.5);
  });
  it("uses exponent 0 for the prospective year itself", () => {
    expect(trendFactor(0.05, 2027, 2027).value).toEqual({ exponent: 0, factor: 1 });
  });
});

describe("policyYearSummary", () => {
  const policies = [
    // PY2025: 100,000 on $20M revenue, fully earned
    policy("p25", { effectiveDate: "2025-01-11", expiryDate: "2026-01-11", annualPremium: 100_000, exposureAmount: 20_000_000 }),
    // PY2026: running year, 146,000 on $25M; 305 of 365 days elapsed at 2026-11-12
    policy("p26", { effectiveDate: "2026-01-11", expiryDate: "2027-01-11", annualPremium: 146_000, exposureAmount: 25_000_000, previousPolicyId: "p25" }),
  ];
  const claims = [
    claim("a", { dateOfLoss: "2025-03-01", paid: 30_000 }),
    claim("b", { dateOfLoss: "2025-09-01", paid: 4_000, reserved: 6_000, status: "open" }),
    claim("c", { dateOfLoss: "2026-04-01", paid: 61_000 }),
    claim("outside", { dateOfLoss: "2024-06-01", paid: 9_999 }), // before any period
    claim("prop", { lineOfBusiness: "Property", dateOfLoss: "2026-04-01", paid: 50_000 }), // other line
  ];
  const raw = policyYearSummary({ claims, policies, line: "General Liability", asOf, adjustments: { trendRate: null, factors: null } }).value;

  it("summarises a complete year", () => {
    const py25 = raw.rows[0];
    expect(py25.label).toBe("PY2025");
    // 30,000 + (4,000 + 6,000) = 40,000
    expect([py25.claimCount, py25.openCount, py25.paid, py25.reserved, py25.incurred]).toEqual([2, 1, 34_000, 6_000, 40_000]);
    expect(py25.earnedPremium).toBe(100_000);
    expect(py25.lossRatio).toBe(0.4); // 40,000 ÷ 100,000
    expect(py25.severity).toBe(20_000); // 40,000 ÷ 2
    expect(py25.frequency).toEqual({ value: 0.1, unit: "per $1M of revenue", reason: null }); // 2 ÷ 20
  });

  it("earns the running year to date", () => {
    const py26 = raw.rows[1];
    expect(py26.current).toBe(true);
    expect(py26.earnedToDate).toBe(true);
    // 146,000 × 305 ÷ 365 = 400 × 305 = 122,000
    expect(py26.earnedPremium).toBe(122_000);
    expect(py26.lossRatio).toBe(0.5); // 61,000 ÷ 122,000
    // 1 ÷ (25 × 305 ÷ 365) = 1 ÷ 20.890411 = 0.047869
    expect(Number(py26.frequency.value!.toFixed(6))).toBe(0.047869);
  });

  it("totals and averages over the five most recent years and excludes claims outside periods", () => {
    expect(raw.excludedOutsidePeriod).toBe(1);
    const t = raw.total!;
    expect(t.label).toBe("2-year total (PY2025–PY2026)");
    // 40,000 + 61,000 = 101,000; 100,000 + 122,000 = 222,000
    expect([t.claimCount, t.incurred, t.earnedPremium]).toEqual([3, 101_000, 222_000]);
    expect(Number(t.lossRatio!.toFixed(6))).toBe(0.454955); // 101,000 ÷ 222,000
    expect(Number(t.severity!.toFixed(2))).toBe(33_666.67); // 101,000 ÷ 3
    // 3 ÷ (20 + 20.890411) = 3 ÷ 40.890411 = 0.073367
    expect(Number(t.frequency.value!.toFixed(6))).toBe(0.073367);
    const a = raw.average!;
    expect([a.claimCount, a.incurred, a.earnedPremium]).toEqual([1.5, 50_500, 111_000]); // ÷ 2
    expect(a.lossRatio).toBe(t.lossRatio); // aggregate, not an average of ratios
    expect(raw.prospectiveYear).toBe(2027); // the current term expires in 2027
  });

  it("applies trend and development on request", () => {
    const adj = policyYearSummary({
      claims,
      policies,
      line: "General Liability",
      asOf,
      adjustments: { trendRate: 0.05, factors: { "12": 1.2, "24": 1.1, "36": 1.05, "48": 1, "60+": 1 } },
    }).value;
    expect(adj.adjusted).toBe(true);
    const [py25, py26] = adj.rows;
    // PY2025: exponent 2027 − 2025 = 2 → 1.1025; age 22 months → bucket 12 → 1.2: 40,000 × 1.1025 × 1.2 = 52,920
    expect([py25.trendExponent, py25.ageBucket, py25.developmentFactor, py25.adjustedIncurred]).toEqual([2, "12", 1.2, 52_920]);
    // PY2026: exponent 1 → 1.05; age 10 → 12 → 1.2: 61,000 × 1.05 × 1.2 = 76,860; ÷ 122,000 = 0.63
    expect(py26.adjustedIncurred).toBe(76_860);
    expect(py26.adjustedLossRatio).toBe(0.63);
    // 52,920 + 76,860 = 129,780 ÷ 222,000 = 0.584595
    expect(adj.total!.adjustedIncurred).toBe(129_780);
    expect(Number(adj.total!.adjustedLossRatio!.toFixed(6))).toBe(0.584595);
    // raw figures unchanged alongside
    expect(adj.total!.incurred).toBe(101_000);
  });

  it("shows the current year plus five before it, totals over the latest five", () => {
    const seven = [2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y, i, arr) =>
      policy(`p${y}`, { effectiveDate: `${y}-01-11`, expiryDate: `${y + 1}-01-11`, previousPolicyId: i > 0 ? `p${arr[i - 1]}` : null }),
    );
    const s = policyYearSummary({ claims: [], policies: seven, line: "General Liability", asOf, adjustments: { trendRate: null, factors: null } }).value;
    // 2021…2026 shown (6 rows); 2022…2026 in the five-year total
    expect(s.rows.map((r) => r.year)).toEqual([2021, 2022, 2023, 2024, 2025, 2026]);
    expect(s.total!.label).toBe("5-year total (PY2022–PY2026)");
    expect(s.total!.severity).toBeNull(); // no claims → em dash, not 0 ÷ 0
    expect(s.rows[0].frequency.value).toBe(0);
  });

  it("handles an account with no policies in the line", () => {
    const s = policyYearSummary({ claims, policies: [], line: "Cyber", asOf, adjustments: { trendRate: null, factors: null } }).value;
    expect(s.rows).toEqual([]);
    expect(s.total).toBeNull();
  });

  it("reports no frequency unit for square-foot bases", () => {
    const s = policyYearSummary({
      claims: [],
      policies: [policy("pp", { exposureBasis: "square_feet", exposureAmount: 50_000 })],
      line: "General Liability",
      asOf,
      adjustments: { trendRate: null, factors: null },
    }).value;
    expect(s.rows[0].frequency).toEqual({ value: null, unit: null, reason: "no frequency unit for a square feet basis" });
  });
});

describe("largeLosses", () => {
  const cs = [120_000, 60_000, 27_000, 25_000, 8_000].map((n, i) => claim(`c${i}`, { paid: n }));
  it("lists claims at or above the threshold with their share", () => {
    const r = largeLosses(cs, 400_000, 25_000, 25_000).value;
    // total = 120,000 + 60,000 + 27,000 + 25,000 + 8,000 = 240,000
    expect(r.totalIncurred).toBe(240_000);
    // 25,000 is "at" the threshold → included; 8,000 is not
    expect(r.rows.map((x) => x.incurred)).toEqual([120_000, 60_000, 27_000, 25_000]);
    expect(r.rows[0].share).toBe(0.5); // 120,000 ÷ 240,000
    expect(r.rows[2].share).toBe(0.1125); // 27,000 ÷ 240,000
  });
  it("caps each claim and compares loss ratios", () => {
    const r = largeLosses(cs, 400_000, 25_000, 25_000).value;
    // 25,000 + 25,000 + 25,000 + 25,000 + 8,000 = 108,000
    expect(r.cappedIncurred).toBe(108_000);
    expect(r.lossRatio).toBe(0.6); // 240,000 ÷ 400,000
    expect(r.cappedLossRatio).toBe(0.27); // 108,000 ÷ 400,000
  });
  it("avoids division by zero", () => {
    const r = largeLosses([], 0, 25_000, 25_000).value;
    expect([r.lossRatio, r.cappedLossRatio, r.rows.length]).toEqual([null, null, 0]);
  });
});

describe("openClaims", () => {
  it("sorts by reserve and shares of incurred", () => {
    const r = openClaims([
      claim("x", { status: "open", paid: 12_000, reserved: 48_000 }),
      claim("y", { status: "open", paid: 30_000, reserved: 90_000 }),
      claim("z", { status: "closed", paid: 125_000 }),
    ]).value;
    expect(r.rows.map((c) => c.id)).toEqual(["y", "x"]);
    // 90,000 + 48,000 = 138,000
    expect(r.totalOpenReserves).toBe(138_000);
    // total incurred = 60,000 + 120,000 + 125,000 = 305,000; 138,000 ÷ 305,000 = 0.452459
    expect(Number(r.reservedShare!.toFixed(6))).toBe(0.452459);
  });
  it("returns no share with nothing incurred", () => {
    expect(openClaims([]).value.reservedShare).toBeNull();
  });
});

describe("claimFlags", () => {
  it("flags each data-quality issue", () => {
    const policies = [policy("p", {})];
    const f = claimFlags(
      [
        claim("ok", { claimNumber: "A-1" }),
        claim("dup1", { claimNumber: "B-1" }),
        claim("dup2", { claimNumber: " b-1 " }), // same number, different case/spacing
        claim("res", { claimNumber: "C-1", status: "closed", reserved: 500 }),
        claim("early", { claimNumber: "D-1", dateOfLoss: "2026-03-10", dateReported: "2026-03-01" }),
        claim("out", { claimNumber: "E-1", dateOfLoss: "2024-01-01", dateReported: "2024-01-02" }),
        claim("future", { claimNumber: "F-1", dateOfLoss: "2026-12-01", dateReported: "2026-12-02" }),
      ],
      policies,
      asOf,
    ).value;
    expect(f.ok).toEqual([]);
    expect(f.dup1).toEqual(["duplicate_number"]);
    expect(f.dup2).toEqual(["duplicate_number"]);
    expect(f.res).toEqual(["closed_with_reserve"]);
    expect(f.early).toEqual(["reported_before_loss"]);
    expect(f.out).toEqual(["outside_period"]);
    expect(f.future).toEqual(["dated_after_as_of"]);
  });
});

describe("CSV import validation", () => {
  it("checks columns in any order", () => {
    expect(checkImportColumns(["Status", "paid", "reserved", "line", "claim_number", "date_reported", "date_of_loss", "description"]).value.missing).toEqual([]);
    expect(checkImportColumns(["claim_number", "line", "extra"]).value).toEqual({
      missing: ["date_of_loss", "date_reported", "description", "paid", "reserved", "status"],
      extra: ["extra"],
    });
  });

  it("matches lines by name or common abbreviation", () => {
    expect(matchLine("general liability")).toBe("General Liability");
    expect(matchLine("GL")).toBe("General Liability");
    expect(matchLine("Marine")).toBeNull();
  });

  const good = { claim_number: "N-1", line: "General Liability", date_of_loss: "2026-03-01", date_reported: "2026-03-05", description: "Slip", paid: "8,000", reserved: "0", status: "closed" };
  it("marks each row valid or invalid with reasons", () => {
    const r = validateImportRows(
      [
        good,
        { ...good, claim_number: "N-2", date_of_loss: "" },
        { ...good, claim_number: "N-3", paid: "eight" },
        { ...good, claim_number: "N-4", line: "Marine" },
        { ...good, claim_number: "N-5", date_of_loss: "2026-12-01", date_reported: "2026-12-02" },
        { ...good }, // N-1 again → duplicate within the file
        { ...good, claim_number: "OLD-9" }, // already on the account
        { ...good, claim_number: "N-8", date_reported: "2026-02-01" },
        { ...good, claim_number: "N-9", status: "pending" },
        { ...good, claim_number: "N-10", reserved: "-5" },
      ],
      { asOf, existingClaimNumbers: ["old-9"] },
    ).value;
    expect(r.map((x) => x.valid)).toEqual([true, false, false, false, false, false, false, false, false, false]);
    expect(r[0].parsed).toMatchObject({ paid: 8000, reserved: 0, status: "closed", lineOfBusiness: "General Liability" });
    expect(r[1].reasons).toEqual(["missing date of loss"]);
    expect(r[2].reasons).toEqual(['non-numeric paid amount "eight"']);
    expect(r[3].reasons).toEqual(['unknown line "Marine"']);
    expect(r[4].reasons).toEqual(["future date of loss (after the as-of date 2026-11-12)", "future date reported (after the as-of date 2026-11-12)"]);
    expect(r[5].reasons).toEqual(["duplicate claim number"]);
    expect(r[6].reasons).toEqual(["duplicate claim number"]);
    expect(r[7].reasons).toEqual(["reported before the date of loss"]);
    expect(r[8].reasons).toEqual(['unknown status "pending" (use open or closed)']);
    expect(r[9].reasons).toEqual(["negative reserved amount"]);
    expect(r.map((x) => x.row)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("warns, without rejecting, on a closed claim with a reserve", () => {
    const [r] = validateImportRows([{ ...good, reserved: "500" }], { asOf, existingClaimNumbers: [] }).value;
    expect(r.valid).toBe(true);
    expect(r.warnings).toEqual(["closed with a reserve"]);
  });
});

describe("claims import: optional peril and value at risk (v1.3)", () => {
  it("accepts the optional columns and rejects a negative value at risk", () => {
    const base = { claim_number: "X-1", line: "Property", date_of_loss: "2026-01-05", date_reported: "2026-01-06", description: "", paid: "1000", reserved: "0", status: "closed" };
    const rs = validateImportRows(
      [
        { ...base, peril: "Flood", value_at_risk: "2,500,000" },
        { ...base, claim_number: "X-2" },
        { ...base, claim_number: "X-3", value_at_risk: "-5" },
      ],
      { asOf: "2026-11-12", existingClaimNumbers: [] },
    ).value;
    expect(rs[0].parsed).toMatchObject({ peril: "Flood", valueAtRisk: 2_500_000 });
    expect(rs[1].parsed).toMatchObject({ peril: null, valueAtRisk: null });
    expect([rs[2].valid, rs[2].reasons]).toEqual([false, ["negative value at risk"]]);
    expect(checkImportColumns([...IMPORT_COLUMNS, "peril", "value_at_risk", "colour"]).value.extra).toEqual(["colour"]);
  });
});
