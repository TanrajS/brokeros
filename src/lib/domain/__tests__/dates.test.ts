import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isExpiryAfterEffective, isISODate } from "../dates";

describe("daysBetween", () => {
  it("counts forward across a month boundary", () => {
    // Jan 30 → Feb 2: Jan 31 (1), Feb 1 (2), Feb 2 (3)
    expect(daysBetween("2026-01-30", "2026-02-02").value).toBe(3);
  });

  it("is zero on the same day", () => {
    expect(daysBetween("2026-06-15", "2026-06-15").value).toBe(0);
  });

  it("is negative when the date is in the past", () => {
    // Jun 15 → Jun 10 is 5 days earlier
    expect(daysBetween("2026-06-15", "2026-06-10").value).toBe(-5);
  });

  it("handles a leap day", () => {
    // 2028 is a leap year: Feb 28 → Mar 1 passes Feb 29, so 2 days
    expect(daysBetween("2028-02-28", "2028-03-01").value).toBe(2);
    // 2026 is not: Feb 28 → Mar 1 is 1 day
    expect(daysBetween("2026-02-28", "2026-03-01").value).toBe(1);
  });

  it("spans a full year", () => {
    // 2026 has 365 days
    expect(daysBetween("2026-01-01", "2027-01-01").value).toBe(365);
  });

  it("returns the math", () => {
    const r = daysBetween("1970-01-01", "1970-01-11");
    // day numbers: 1970-01-01 = 0, 1970-01-11 = 10 → 10 − 0 = 10
    expect(r.math.inputs).toEqual({ asOf: "1970-01-01", date: "1970-01-11" });
    expect(r.math.steps).toEqual({ asOfDayNumber: 0, dateDayNumber: 10, days: 10 });
    expect(r.math.formula).toContain("day number");
  });

  it("throws on invalid dates", () => {
    expect(() => daysBetween("2026-02-30", "2026-03-01")).toThrow();
    expect(() => daysBetween("not a date", "2026-03-01")).toThrow();
  });
});

describe("addDays", () => {
  it("adds across a year end", () => {
    // Dec 30 + 3 = Jan 2 (Dec 31, Jan 1, Jan 2)
    expect(addDays("2026-12-30", 3).value).toBe("2027-01-02");
  });
  it("subtracts", () => {
    // Mar 1 − 1 = Feb 28 in a non-leap year
    expect(addDays("2026-03-01", -1).value).toBe("2026-02-28");
  });
  it("round-trips with daysBetween", () => {
    const asOf = "2026-11-12";
    for (const n of [-30, 0, 30, 60, 90, 120, 121, 400]) {
      // addDays(asOf, n) then daysBetween(asOf, that) must give n back
      expect(daysBetween(asOf, addDays(asOf, n).value).value).toBe(n);
    }
  });
});

describe("isExpiryAfterEffective", () => {
  it("accepts a later expiry", () => {
    // 365 days later → > 0 → true
    expect(isExpiryAfterEffective("2026-01-01", "2027-01-01").value).toBe(true);
  });
  it("rejects same day and earlier", () => {
    // 0 days → false; −1 day → false
    expect(isExpiryAfterEffective("2026-01-01", "2026-01-01").value).toBe(false);
    expect(isExpiryAfterEffective("2026-01-02", "2026-01-01").value).toBe(false);
  });
});

describe("isISODate", () => {
  it("validates shape and calendar", () => {
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("2026-02-29")).toBe(false); // 2026 is not a leap year
    expect(isISODate("2026-13-01")).toBe(false);
    expect(isISODate("26-01-01")).toBe(false);
    expect(isISODate(20260101)).toBe(false);
  });
});
