import { describe, expect, it } from "vitest";
import { claimFlags, policyYearSummary } from "@/lib/domain/lossRuns";
import { buildDemoBook } from "../demoBookData";
import { demoAccountToLossRuns } from "../demoBookLossRuns";

const asOf = "2026-11-12";
const book = buildDemoBook(asOf);
const account = (name: string) => demoAccountToLossRuns(book.find((a) => a.name === name)!);
const summarize = (name: string) => {
  const { policies, claims } = account(name);
  return policyYearSummary({ claims, policies, line: "General Liability", asOf, adjustments: { trendRate: null, factors: null } }).value;
};

describe("Harbourline Foods loss run (hand-verification case)", () => {
  const s = summarize("Harbourline Foods Inc.");

  it("has five GL policy years, PY2022 to PY2026, with the running year current", () => {
    expect(s.rows.map((r) => r.label)).toEqual(["PY2022", "PY2023", "PY2024", "PY2025", "PY2026"]);
    expect(s.rows.map((r) => r.period.premium)).toEqual([135_000, 140_000, 145_000, 148_000, 150_000]);
    expect(s.rows[4].current).toBe(true);
    expect(s.rows[4].period.expiryDate).toBe("2027-01-11"); // the in-book policy, 60 days after the as-of date
  });

  it("matches the specified PY2023 figures", () => {
    const py23 = s.rows[1];
    // 15,000 + 120,000 = 135,000
    expect(py23.incurred).toBe(135_000);
    // 135,000 ÷ 140,000 = 0.964285… → 0.9643
    expect(Number(py23.lossRatio!.toFixed(4))).toBe(0.9643);
    // 135,000 ÷ 2 = 67,500
    expect(py23.severity).toBe(67_500);
    // 2 claims ÷ (25,000,000 ÷ 1,000,000 = 25) = 0.08 per $1M of revenue
    expect(py23.frequency.value).toBe(0.08);
    expect(py23.frequency.unit).toBe("per $1M of revenue");
  });

  it("totals 12 claims and 305,000 incurred over five years", () => {
    // 44,500 + 135,000 + 35,500 + 60,000 + 30,000 = 305,000; 3 + 2 + 3 + 1 + 3 = 12
    expect(s.rows.map((r) => r.incurred)).toEqual([44_500, 135_000, 35_500, 60_000, 30_000]);
    expect(s.total!.claimCount).toBe(12);
    expect(s.total!.incurred).toBe(305_000);
    expect(s.total!.label).toBe("5-year total (PY2022–PY2026)");
    // the two open claims carry most of their incurred as reserve
    expect(s.total!.openCount).toBe(2);
    expect(s.total!.reserved).toBe(138_000); // 90,000 + 48,000
  });

  it("earns the running year to date", () => {
    // PY2026 runs 2026-01-11 to 2027-01-11; 305 of 365 days elapsed; 150,000 × 305 ÷ 365 = 125,342.47
    expect(s.rows[4].earnedPremium).toBe(125_342.47);
  });

  it("has no data-quality flags", () => {
    const { policies, claims } = account("Harbourline Foods Inc.");
    expect(Object.values(claimFlags(claims, policies, asOf).value).flat()).toEqual([]);
  });
});

describe("Cedar Ridge Mechanical loss run", () => {
  const s = summarize("Cedar Ridge Mechanical Ltd.");
  it("has rising premiums and revenue with three claims", () => {
    expect(s.rows.map((r) => r.period.premium)).toEqual([82_000, 88_000, 94_000, 100_000, 108_000]);
    expect(s.rows.map((r) => r.period.exposureAmount)).toEqual([15_000_000, 17_000_000, 18_500_000, 20_000_000, 23_000_000]);
    // PY2022 11,000; PY2024 4,200; PY2025 45,000 (open)
    expect(s.rows.map((r) => r.incurred)).toEqual([11_000, 0, 4_200, 45_000, 0]);
    expect(s.total!.claimCount).toBe(3);
    expect(s.total!.openCount).toBe(1);
    expect(s.rows[1].severity).toBeNull(); // no claims in PY2023 → em dash
  });
});
