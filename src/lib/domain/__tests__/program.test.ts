import { describe, expect, it } from "vitest";
import {
  analyzeParticipation,
  analyzeTower,
  certificateStatus,
  checkRequirements,
  coinsurancePayment,
  compactDollars,
  type ProgramPolicy,
  type RequirementInput,
  type TowerLayerInput,
} from "../program";

const M = 1_000_000;

describe("analyzeTower", () => {
  const tower: TowerLayerInput[] = [
    { id: "p", layerType: "primary", attachment: 0, limit: 1 * M, premium: 150_000, carrier: "Northgate Mutual" },
    { id: "u", layerType: "umbrella", attachment: 1 * M, limit: 5 * M, premium: 22_000, carrier: "Boreal Casualty Company" },
    { id: "x", layerType: "excess", attachment: 6 * M, limit: 10 * M, premium: 18_000, carrier: "Aurora Commercial Underwriters" },
  ];

  it("matches the specified continuous tower", () => {
    const r = analyzeTower(tower).value;
    expect(r.continuous).toBe(true);
    // 1M + 5M + 10M = 16M
    expect(r.totalLimit).toBe(16 * M);
    expect(r.topExhaustion).toBe(16 * M);
    expect(r.findings).toEqual([]);
    const [p, u, x] = r.layers;
    // exhaustions: 0 + 1M = 1M; 1M + 5M = 6M; 6M + 10M = 16M
    expect([p.exhaustion, u.exhaustion, x.exhaustion]).toEqual([1 * M, 6 * M, 16 * M]);
    // primary 150,000 ÷ 1,000,000 = 0.15 = 15%
    expect(p.rateOnLine).toBe(0.15);
    // umbrella 22,000 ÷ 5,000,000 = 0.0044 = 0.44%
    expect(u.rateOnLine).toBeCloseTo(0.0044, 10);
    // excess 18,000 ÷ 10,000,000 = 0.0018 = 0.18%
    expect(x.rateOnLine).toBeCloseTo(0.0018, 10);
    // premium per $1M: 22,000 ÷ 5 = 4,400; 18,000 ÷ 10 = 1,800
    expect([u.premiumPerMillion, x.premiumPerMillion]).toEqual([4_400, 1_800]);
    // relative to primary: 0.0044 ÷ 0.15 = 0.029333…
    expect(Number(u.relativeRate!.toFixed(6))).toBe(0.029333);
    expect(u.label).toBe("$5M xs $1M");
    expect(p.label).toBe("$1M primary");
  });

  it("finds a $1M gap when the excess attaches at $7M", () => {
    const r = analyzeTower(tower.map((l) => (l.id === "x" ? { ...l, attachment: 7 * M } : l))).value;
    expect(r.continuous).toBe(false);
    expect(r.totalLimit).toBeNull();
    // 7M − 6M = 1M
    expect(r.findings).toEqual([expect.objectContaining({ kind: "gap", layerId: "x", amount: 1 * M })]);
    expect(r.topExhaustion).toBe(17 * M); // 7M + 10M
  });

  it("finds a $1M overlap when the excess attaches at $5M", () => {
    const r = analyzeTower(tower.map((l) => (l.id === "x" ? { ...l, attachment: 5 * M } : l))).value;
    // 6M − 5M = 1M
    expect(r.findings).toEqual([expect.objectContaining({ kind: "overlap", layerId: "x", amount: 1 * M })]);
    expect(r.continuous).toBe(false);
  });

  it("flags a primary above zero and a rate inversion", () => {
    const r = analyzeTower([
      { id: "p", layerType: "primary", attachment: 25_000, limit: 1 * M, premium: 50_000, carrier: "A" },
      // 1,025,000 attachment is continuous; 30,000 ÷ 2M = 1.5% > primary's 5%? no: 50,000 ÷ 1M = 5% → not inverted
      { id: "u", layerType: "umbrella", attachment: 1_025_000, limit: 2 * M, premium: 30_000, carrier: "B" },
      // 60,000 ÷ 3M = 2% > umbrella's 1.5% → inversion
      { id: "x", layerType: "excess", attachment: 3_025_000, limit: 3 * M, premium: 60_000, carrier: "C" },
    ]).value;
    expect(r.findings.map((f) => f.kind)).toEqual(["primary_not_at_zero", "rate_inversion"]);
    expect(r.findings[0].amount).toBe(25_000);
    expect(r.continuous).toBe(true);
  });

  it("sorts by attachment and handles an empty tower", () => {
    const r = analyzeTower([tower[2], tower[0], tower[1]]).value;
    expect(r.layers.map((l) => l.id)).toEqual(["p", "u", "x"]);
    const empty = analyzeTower([]).value;
    expect(empty).toEqual({ layers: [], continuous: false, totalLimit: null, topExhaustion: null, findings: [] });
  });

  it("flags a tower without a primary", () => {
    expect(analyzeTower([tower[1]]).value.findings.map((f) => f.kind)).toEqual(["no_primary"]);
  });

  it("formats compact dollars", () => {
    expect([compactDollars(16 * M), compactDollars(2_500_000), compactDollars(500_000), compactDollars(750)]).toEqual(["$16M", "$2.5M", "$500K", "$750"]);
  });
});

const policy = (id: string, over: Partial<ProgramPolicy>): ProgramPolicy => ({
  id,
  lineOfBusiness: "General Liability",
  occurrenceLimit: 1 * M,
  aggregateLimit: 2 * M,
  endorsements: ["additional_insured"],
  effectiveDate: "2026-01-11",
  expiryDate: "2027-01-11",
  renewalStatus: "in_progress",
  previousPolicyId: null,
  renewedOn: null,
  ...over,
});

describe("checkRequirements", () => {
  const req: RequirementInput = {
    id: "r1",
    contractName: "Supply agreement",
    counterparty: "Westbay Grocers",
    coverage: "General Liability",
    requiredOccurrence: 2 * M,
    requiredAggregate: 4 * M,
    requiredEndorsements: ["additional_insured", "waiver_of_subrogation", "primary_noncontributory"],
  };
  const policies = [policy("gl", {})];
  const tower: TowerLayerInput[] = [
    { id: "p", layerType: "primary", attachment: 0, limit: 1 * M, premium: 150_000, carrier: "A" },
    { id: "u", layerType: "umbrella", attachment: 1 * M, limit: 5 * M, premium: 22_000, carrier: "B" },
  ];

  it("matches the specified example on the strict basis", () => {
    const [r] = checkRequirements([req], policies, tower, { countUmbrella: false }).value;
    // 2M − 1M = 1M; 4M − 2M = 2M
    expect([r.status, r.shortfallOccurrence, r.shortfallAggregate]).toEqual(["shortfall", 1 * M, 2 * M]);
    expect(r.endorsementsPresent).toEqual(["additional_insured"]);
    expect(r.endorsementsMissing).toEqual(["waiver_of_subrogation", "primary_noncontributory"]);
    expect(r.umbrellaCounted).toBe(0);
  });

  it("matches the specified example with the umbrella counted", () => {
    const [r] = checkRequirements([req], policies, tower, { countUmbrella: true }).value;
    // 1M + 5M umbrella = 6M ≥ 2M → occurrence met; aggregate still 4M − 2M = 2M short
    expect([r.providedOccurrence, r.shortfallOccurrence, r.shortfallAggregate]).toEqual([6 * M, 0, 2 * M]);
    expect(r.umbrellaCounted).toBe(5 * M);
    expect(r.status).toBe("shortfall");
    expect(r.endorsementsMissing).toHaveLength(2);
  });

  it("reports Meets, Missing coverage and statutory lines", () => {
    const rs = checkRequirements(
      [
        { ...req, id: "ok", requiredOccurrence: 1 * M, requiredAggregate: 2 * M, requiredEndorsements: ["additional_insured"] },
        { ...req, id: "auto", coverage: "Commercial Auto", requiredOccurrence: 1 * M, requiredAggregate: null, requiredEndorsements: [] },
        { ...req, id: "wc", coverage: "Workers Compensation", requiredOccurrence: null, requiredAggregate: null, requiredEndorsements: [] },
        { ...req, id: "umb", coverage: "Umbrella/Excess", requiredOccurrence: 5 * M, requiredAggregate: null, requiredEndorsements: [] },
        { ...req, id: "umb10", coverage: "Umbrella/Excess", requiredOccurrence: 10 * M, requiredAggregate: null, requiredEndorsements: [] },
      ],
      [...policies, policy("wc", { lineOfBusiness: "Workers Compensation", occurrenceLimit: null, aggregateLimit: null, endorsements: [] })],
      tower,
      { countUmbrella: false },
    ).value;
    expect(rs.map((r) => r.status)).toEqual(["meets", "missing", "meets", "meets", "shortfall"]);
    // umbrella requirement met by the 5M tower layer; 10M − 5M = 5M short
    expect(rs[4].shortfallOccurrence).toBe(5 * M);
  });
});

describe("certificateStatus", () => {
  const asOf = "2026-11-12";
  const gl = policy("gl", {});
  const base = { id: "c", holder: "Westbay Grocers", coverages: ["General Liability" as const], requiredBy: null, issuedOn: null };

  it("is requested until issued, expired once required-by passes unissued", () => {
    expect(certificateStatus({ ...base, requiredBy: "2026-12-01" }, [gl], asOf).value.status).toBe("requested");
    expect(certificateStatus({ ...base, requiredBy: "2026-11-12" }, [gl], asOf).value.status).toBe("requested"); // due today is not past
    expect(certificateStatus({ ...base, requiredBy: "2026-11-11" }, [gl], asOf).value.status).toBe("expired");
    expect(certificateStatus({ ...base }, [gl], asOf).value.status).toBe("requested");
  });

  it("is issued while the underlying policy is in force", () => {
    const r = certificateStatus({ ...base, issuedOn: "2026-03-01" }, [gl], asOf).value;
    expect(r.status).toBe("issued");
    expect(r.underlyingPolicyIds).toEqual(["gl"]);
  });

  it("needs reissue when the underlying policy expired by the as-of date", () => {
    // policy expired 2026-10-01 < as-of
    const old = policy("old", { effectiveDate: "2025-10-01", expiryDate: "2026-10-01" });
    const r = certificateStatus({ ...base, issuedOn: "2026-03-01" }, [old], asOf).value;
    expect(r.status).toBe("reissue_needed");
    expect(r.reasons[0]).toMatch(/expired on 2026-10-01/);
  });

  it("needs reissue once the underlying policy is renewed after the issue date", () => {
    const successor = policy("gl2", { effectiveDate: "2027-01-11", expiryDate: "2028-01-11", previousPolicyId: "gl", renewalStatus: "not_started" });
    const renewed = { ...gl, renewalStatus: "renewed" as const, renewedOn: "2026-11-12" };
    const r = certificateStatus({ ...base, issuedOn: "2026-03-01" }, [renewed, successor], asOf).value;
    expect(r.status).toBe("reissue_needed");
    expect(r.reasons[0]).toMatch(/renewed on 2026-11-12 \(successor effective 2027-01-11\)/);
    // Reissued on the day of the renewal: the renewal is not "since issuance" → issued
    expect(certificateStatus({ ...base, issuedOn: "2026-11-12" }, [renewed, successor], asOf).value.status).toBe("issued");
  });

  it("needs reissue when a requested line had no policy in force at issuance", () => {
    const r = certificateStatus({ ...base, coverages: ["General Liability", "Cyber"], issuedOn: "2026-03-01" }, [gl], asOf).value;
    expect(r.status).toBe("reissue_needed");
    expect(r.reasons).toEqual(["Cyber: no policy was in force on the issue date 2026-03-01"]);
  });
});

describe("coinsurancePayment", () => {
  it("matches the specified example", () => {
    const r = coinsurancePayment({ insurableValue: 1 * M, coinsurancePercent: 80, carriedLimit: 600_000, loss: 100_000, deductible: 5_000 }).value;
    // required = 1,000,000 × 80% = 800,000
    expect(r.requiredLimit).toBe(800_000);
    expect(r.underinsured).toBe(true);
    // (600,000 ÷ 800,000) × 100,000 − 5,000 = 0.75 × 100,000 − 5,000 = 70,000
    expect(r.payment).toBe(70_000);
    // 100,000 − 70,000 = 30,000
    expect(r.clientAbsorbs).toBe(30_000);
    // 1 − 0.75 = 0.25
    expect(r.penaltyShare).toBe(0.25);
    // 800,000 − 600,000 = 200,000
    expect(r.additionalLimitNeeded).toBe(200_000);
  });

  it("pays in full above the required limit", () => {
    // carried 800,000 ≥ required 800,000: min(100,000, 800,000) − 5,000 = 95,000
    const r = coinsurancePayment({ insurableValue: 1 * M, coinsurancePercent: 80, carriedLimit: 800_000, loss: 100_000, deductible: 5_000 }).value;
    expect([r.payment, r.clientAbsorbs, r.penaltyShare, r.additionalLimitNeeded]).toEqual([95_000, 5_000, 0, 0]);
  });

  it("caps at the carried limit and floors at zero", () => {
    // total loss 1,000,000 × 0.75 = 750,000 − 5,000 = 745,000 → capped at 600,000
    expect(coinsurancePayment({ insurableValue: 1 * M, coinsurancePercent: 80, carriedLimit: 600_000, loss: 1 * M, deductible: 5_000 }).value.payment).toBe(600_000);
    // 0.75 × 4,000 − 5,000 = −2,000 → 0
    expect(coinsurancePayment({ insurableValue: 1 * M, coinsurancePercent: 80, carriedLimit: 600_000, loss: 4_000, deductible: 5_000 }).value.payment).toBe(0);
  });

  it("rejects bad input", () => {
    expect(() => coinsurancePayment({ insurableValue: -1, coinsurancePercent: 80, carriedLimit: 0, loss: 0, deductible: 0 })).toThrow();
    expect(() => coinsurancePayment({ insurableValue: 1, coinsurancePercent: 120, carriedLimit: 0, loss: 0, deductible: 0 })).toThrow();
  });
});

describe("analyzeParticipation", () => {
  const policyRef = { annualPremium: 420_000, occurrenceLimit: 10 * M };
  it("totals lines and premiums and computes shares", () => {
    const r = analyzeParticipation(
      [
        { id: "a", carrier: "Aurora", role: "lead", signedLine: 50, premium: 210_000 },
        { id: "b", carrier: "Dominion", role: "follow", signedLine: 30, premium: 126_000 },
        { id: "c", carrier: "Boreal", role: "follow", signedLine: 20, premium: 84_000 },
      ],
      policyRef,
    ).value;
    // 50 + 30 + 20 = 100; 210,000 + 126,000 + 84,000 = 420,000
    expect([r.totalSignedLine, r.totalPremium, r.unplacedLine]).toEqual([100, 420_000, 0]);
    expect(r.findings).toEqual([]);
    // 10M × 50% = 5M; 210,000 ÷ 5M = 0.042; 210,000 ÷ 420,000 = 0.5
    expect([r.participants[0].limitShare, r.participants[0].rateOnLine, r.participants[0].premiumShare]).toEqual([5 * M, 0.042, 0.5]);
  });
  it("flags short placement, premium mismatch and two leads", () => {
    const r = analyzeParticipation(
      [
        { id: "a", carrier: "Aurora", role: "lead", signedLine: 50, premium: 200_000 },
        { id: "b", carrier: "Dominion", role: "lead", signedLine: 30, premium: 100_000 },
      ],
      policyRef,
    ).value;
    // 100 − 80 = 20 unplaced; 300,000 vs 420,000
    expect(r.unplacedLine).toBe(20);
    expect(r.findings).toHaveLength(3);
    expect(r.findings[0]).toMatch(/20% of the placement is unplaced/);
    expect(r.findings[1]).toMatch(/difference −\$120,000/);
  });
  it("handles no participants", () => {
    const r = analyzeParticipation([], policyRef).value;
    expect([r.totalSignedLine, r.totalPremium, r.findings.length]).toEqual([0, null, 0]);
  });
});
