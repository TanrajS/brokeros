import { describe, expect, it } from "vitest";
import { nextExpiry } from "../book";

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
