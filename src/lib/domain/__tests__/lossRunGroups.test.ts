import { describe, expect, it } from "vitest";
import { CLAIM_FLAGS, CLAIM_FLAG_LABELS, CLAIM_FLAG_REASONS, groupPolicyYears, type PolicyPeriod } from "../lossRuns";

/* v1.5: the Loss runs tab splits policy years into "Active and in progress" and "Expired". As-of 2026-11-12. */
const asOf = "2026-11-12";
const period = (id: string, eff: string, exp: string): { period: PolicyPeriod } => ({
  period: { policyId: id, year: Number(eff.slice(0, 4)), label: `PY${eff.slice(0, 4)}: ${eff} to ${exp}`, effectiveDate: eff, expiryDate: exp, premium: 1, exposureBasis: "revenue", exposureAmount: null },
});

describe("groupPolicyYears", () => {
  const rows = [
    period("py22", "2022-01-11", "2023-01-11"), // expired, renewed → expired
    period("py23", "2023-01-11", "2024-01-11"), // expired, renewed → expired
    period("py24", "2024-01-11", "2025-01-11"), // expired, no outcome, status not_started → in a renewal stage without an outcome → active
    period("py25", "2025-01-11", "2026-01-11"), // expired, non-renewed → expired
    period("py26", "2026-01-11", "2027-01-11"), // in force → active
    period("lost", "2026-06-01", "2027-06-01"), // in force but lost → active (in force comes first)
  ];
  const status = {
    py22: { renewalStatus: "renewed" as const, hasOutcome: true },
    py23: { renewalStatus: "renewed" as const, hasOutcome: true },
    py24: { renewalStatus: "not_started" as const, hasOutcome: false },
    py25: { renewalStatus: "non_renewed" as const, hasOutcome: true },
    py26: { renewalStatus: "in_progress" as const, hasOutcome: false },
    lost: { renewalStatus: "lost" as const, hasOutcome: true },
  };

  it("puts in-force and open-without-outcome years in Active, soonest expiry first", () => {
    const g = groupPolicyYears(rows, asOf, status).value;
    // active: py24 (expired 2025-01-11, no outcome), py26 (2027-01-11), lost (2027-06-01) → sorted by expiry ascending
    expect(g.active.map((r) => r.period.policyId)).toEqual(["py24", "py26", "lost"]);
  });

  it("puts expired or closed years in Expired, most recent expiry first", () => {
    const g = groupPolicyYears(rows, asOf, status).value;
    // expired: py25 (2026-01-11), py23 (2024-01-11), py22 (2023-01-11) → descending
    expect(g.expired.map((r) => r.period.policyId)).toEqual(["py25", "py23", "py22"]);
  });

  it("treats a policy with no status row as open and explains each placement", () => {
    const g = groupPolicyYears([period("x", "2020-01-01", "2021-01-01")], asOf, {});
    expect(g.value.active.map((r) => r.period.policyId)).toEqual(["x"]);
    expect(g.math.steps.lines).toEqual(["PY2020: 2020-01-01 to 2021-01-01: expired, no outcome, status not_started → active and in progress"]);
  });
});

describe("claim flag reasons", () => {
  it("has a label and a reason for every flag", () => {
    for (const f of CLAIM_FLAGS) {
      expect(CLAIM_FLAG_LABELS[f].length).toBeGreaterThan(0);
      expect(CLAIM_FLAG_REASONS[f].length).toBeGreaterThan(CLAIM_FLAG_LABELS[f].length);
    }
  });
});
