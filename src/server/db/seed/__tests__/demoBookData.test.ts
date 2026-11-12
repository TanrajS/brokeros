import { describe, expect, it } from "vitest";
import { buildDemoBook } from "../demoBookData";
import { daysBetween } from "@/lib/domain/dates";

const asOf = "2026-11-12";
const book = buildDemoBook(asOf);
const allPolicies = book.flatMap((a) => a.policies.map((p) => ({ account: a.name, ...p })));

describe("buildDemoBook", () => {
  it("has 14 accounts across the six industries", () => {
    expect(book).toHaveLength(14);
    const industries = new Set(book.map((a) => a.industry));
    for (const i of ["construction", "manufacturing", "hospitality", "professional services", "transportation", "retail"]) {
      expect(industries.has(i as never)).toBe(true);
    }
  });

  it("has about 45 policies, 2 to 5 per account except the empty one", () => {
    expect(allPolicies.length).toBeGreaterThanOrEqual(42);
    expect(allPolicies.length).toBeLessThanOrEqual(50);
    const empty = book.filter((a) => a.policies.length === 0);
    expect(empty).toHaveLength(1);
    expect(empty[0].name).toBe("Summit Row Outfitters Inc.");
    for (const a of book) {
      if (a.policies.length === 0) continue;
      expect(a.policies.length).toBeGreaterThanOrEqual(2);
      expect(a.policies.length).toBeLessThanOrEqual(5);
    }
  });

  it("keeps premiums, commissions and expiries within the specified ranges", () => {
    for (const p of allPolicies) {
      expect(p.annualPremium).toBeGreaterThanOrEqual(6_000);
      expect(p.annualPremium).toBeLessThanOrEqual(420_000);
      expect(p.commissionRate).toBeGreaterThanOrEqual(10);
      expect(p.commissionRate).toBeLessThanOrEqual(17.5);
      const days = daysBetween(asOf, p.expiryDate).value;
      expect(days).toBeGreaterThanOrEqual(-30);
      expect(days).toBeLessThanOrEqual(400);
      expect(days).toBe(p.expiryOffsetDays);
      // every term is a 365-day policy: expiry − 365 = effective
      expect(daysBetween(p.effectiveDate, p.expiryDate).value).toBe(365);
    }
  });

  it("includes the required exact day offsets", () => {
    const offsets = new Set(allPolicies.map((p) => p.expiryOffsetDays));
    for (const required of [120, 121, 90, 60, 30, 0]) expect(offsets.has(required)).toBe(true);
    expect(allPolicies.some((p) => p.expiryOffsetDays < 0)).toBe(true);
  });

  it("shapes Cedar Ridge Mechanical exactly as specified", () => {
    const a = book.find((x) => x.name === "Cedar Ridge Mechanical Ltd.")!;
    expect(a.industry).toBe("construction");
    expect(a.annualRevenue).toBe(23_000_000);
    expect(a.employeeCount).toBe(140);
    const gl = a.policies.find((p) => p.lineOfBusiness === "General Liability")!;
    expect(gl.occurrenceLimit).toBe(1_000_000);
    expect(gl.aggregateLimit).toBe(2_000_000);
    expect(gl.deductible).toBe(5_000);
    expect(gl.annualPremium).toBe(108_000);
    expect(gl.commissionRate).toBe(15);
    expect(gl.exposureBasis).toBe("revenue");
    expect(gl.endorsements).toEqual(["additional_insured"]);
  });

  it("shapes Harbourline Foods exactly as specified", () => {
    const a = book.find((x) => x.name === "Harbourline Foods Inc.")!;
    expect(a.industry).toBe("manufacturing");
    expect(a.annualRevenue).toBe(25_000_000);
    expect(a.employeeCount).toBe(210);
    const gl = a.policies.find((p) => p.lineOfBusiness === "General Liability")!;
    expect(gl.occurrenceLimit).toBe(1_000_000);
    expect(gl.aggregateLimit).toBe(2_000_000);
    expect(gl.deductible).toBe(10_000);
    expect(gl.annualPremium).toBe(150_000);
    expect(gl.commissionRate).toBe(12.5);
    expect(gl.exposureBasis).toBe("revenue");
    expect(gl.exposureAmount).toBe(25_000_000);
    // 2026-11-12 + 60 days = 2027-01-11 (18 days left in Nov, 31 in Dec, 11 in Jan)
    expect(gl.expiryDate).toBe("2027-01-11");
    expect(gl.expiryOffsetDays).toBe(60);
  });

  it("uses only fictional .example emails and unique policy numbers", () => {
    for (const a of book) for (const c of a.contacts) if (c.email) expect(c.email.endsWith(".example")).toBe(true);
    const numbers = allPolicies.map((p) => p.policyNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("is deterministic for the same as-of date", () => {
    expect(buildDemoBook(asOf)).toEqual(book);
  });
});
