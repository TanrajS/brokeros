import { describe, expect, it } from "vitest";
import { RETIRED_DEMO_ACCOUNT_PREFIXES, isRetiredDemoAccountName, nameConflict, nextExpiry, normalizeName } from "../book";

describe("nextExpiry", () => {
  const asOf = "2026-11-12";

  it("picks the soonest upcoming expiry", () => {
    // 2026-12-12 is +30, 2027-03-12 is +120, 2026-11-12 is 0 → choose 0 (today counts as upcoming)
    const r = nextExpiry(asOf, ["2027-03-12", "2026-12-12", "2026-11-12"]);
    expect(r.value).toEqual({ date: "2026-11-12", days: 0 });
  });

  it("ignores expired policies when an upcoming one exists", () => {
    // 2026-10-13 is −30 (expired); 2026-12-12 is +30 → choose +30
    const r = nextExpiry(asOf, ["2026-10-13", "2026-12-12"]);
    expect(r.value).toEqual({ date: "2026-12-12", days: 30 });
  });

  it("falls back to the most recently expired policy", () => {
    // 2026-10-13 is −30, 2026-08-14 is −90 → choose −30
    const r = nextExpiry(asOf, ["2026-08-14", "2026-10-13"]);
    expect(r.value).toEqual({ date: "2026-10-13", days: -30 });
  });

  it("returns nulls for an account with no policies", () => {
    const r = nextExpiry(asOf, []);
    expect(r.value).toEqual({ date: null, days: null });
    expect(r.math.steps.chosen).toBeNull();
  });
});

describe("account and policy-number uniqueness (v1.5.1)", () => {
  const existing = [
    { id: "a1", name: "Harbourline Foods Inc." },
    { id: "a2", name: "  Cedar Ridge Mechanical Ltd. " },
  ];
  it("matches case-insensitively and ignores surrounding whitespace", () => {
    // "harbourline foods inc." → trim + lower = "harbourline foods inc." = a1
    expect(nameConflict("  harbourline FOODS inc.  ", existing).value).toEqual({ id: "a1", name: "Harbourline Foods Inc." });
    // the stored name carries spaces too; both sides are trimmed
    expect(nameConflict("cedar ridge mechanical ltd.", existing).value?.id).toBe("a2");
    expect(nameConflict("Harbourline Foods", existing).value).toBeNull();
    expect(nameConflict("   ", existing).value).toBeNull();
  });
  it("skips the row being edited", () => {
    expect(nameConflict("Harbourline Foods Inc.", existing, "a1").value).toBeNull();
    expect(nameConflict("Harbourline Foods Inc.", existing, "a2").value?.id).toBe("a1");
  });
  it("normalises the same way the database index does: lower(trim(name))", () => {
    expect(normalizeName("  Summit Ridge Builders INC. ")).toBe("summit ridge builders inc.");
  });
});

describe("retired demo account names (v1.5.1)", () => {
  it("matches the seven retired prefixes on the whole first word, case-insensitively", () => {
    for (const n of ["Ashgrove Engineering Consultants Inc.", "Kestrel Precision Components Corp.", "Prairie Loop Logistics Inc.", "Bluewater Civil Contractors Inc.", "Copperfield Home & Garden Ltd.", "Maple & Mast Hospitality Group", "Tidewater Accounting Partners LLP", "  tidewater something"]) {
      expect(isRetiredDemoAccountName(n)).toBe(true);
    }
    expect(RETIRED_DEMO_ACCOUNT_PREFIXES).toHaveLength(7);
  });
  it("leaves every current demo account and look-alikes alone", () => {
    for (const n of ["Harbourline Foods Inc.", "Cedar Ridge Mechanical Ltd.", "Pacific Northwest Terminals Ltd.", "Kootenay Alpine Resorts Inc.", "Maplewood Underwriters (fictional)", "Greyhawk Freight Lines Ltd.", "Prairieview Farms", ""]) {
      expect(isRetiredDemoAccountName(n)).toBe(false);
    }
  });
});
