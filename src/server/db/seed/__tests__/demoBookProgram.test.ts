import { describe, expect, it } from "vitest";
import { analyzeParticipation, analyzeTower, certificateStatus, checkRequirements, coinsurancePayment } from "@/lib/domain/program";
import { buildDemoBook } from "../demoBookData";
import { demoAccountToProgram } from "../demoBookProgram";

const asOf = "2026-11-12";
const book = buildDemoBook(asOf);
const account = (name: string) => book.find((a) => a.name === name)!;
const M = 1_000_000;

describe("Harbourline Foods program", () => {
  const { policies, layers, requirements, certificates } = demoAccountToProgram(account("Harbourline Foods Inc."), asOf);

  it("has the specified continuous three-layer tower", () => {
    const t = analyzeTower(layers).value;
    expect(t.continuous).toBe(true);
    expect(t.totalLimit).toBe(16 * M); // 1M + 5M + 10M
    expect(t.layers.map((l) => l.rateOnLine)).toEqual([0.15, 0.0044, 0.0018]);
  });

  it("checks the Westbay supply agreement", () => {
    const strict = checkRequirements(requirements, policies, layers, { countUmbrella: false }).value;
    // GL: 1M/2M provided vs 2M/4M → short 1M / 2M; waiver and primary non-contributory present on the current GL (stdGl), so none missing
    const gl = strict.find((r) => r.requirement.coverage === "General Liability")!;
    expect([gl.status, gl.shortfallOccurrence, gl.shortfallAggregate, gl.endorsementsMissing]).toEqual(["shortfall", 1 * M, 2 * M, []]);
    // Umbrella 5M required; tower umbrella + excess = 15M → meets
    expect(strict.find((r) => r.requirement.coverage === "Umbrella/Excess")!.status).toBe("meets");
    // Auto: policy occurrence 2M ≥ 1M but no additional insured endorsement → shortfall (endorsement only)
    const auto = strict.find((r) => r.requirement.coverage === "Commercial Auto")!;
    expect([auto.status, auto.shortfallOccurrence, auto.endorsementsMissing]).toEqual(["shortfall", 0, ["additional_insured"]]);
    // No Workers Compensation policy on the account
    expect(strict.find((r) => r.requirement.coverage === "Workers Compensation")!.status).toBe("missing");
    // With the umbrella counted: GL occurrence 1M + 15M = 16M ≥ 2M; aggregate still 2M short
    const withUmb = checkRequirements(requirements, policies, layers, { countUmbrella: true }).value.find((r) => r.requirement.coverage === "General Liability")!;
    expect([withUmb.shortfallOccurrence, withUmb.shortfallAggregate]).toEqual([0, 2 * M]);
  });

  it("has one issued certificate and one that flips to reissue once the GL renews", () => {
    const [auto, port] = certificates.map((c) => certificateStatus(c, policies, asOf).value);
    expect(auto.status).toBe("issued");
    expect(port.status).toBe("issued");
    // Record the GL renewal: a successor with previousPolicyId = harbour-gl
    // Record the GL renewal today: the old policy gets renewedOn = as-of, and a successor appears
    const renewed = policies.map((p) => (p.id === "harbour-gl" ? { ...p, renewalStatus: "renewed" as const, renewedOn: asOf } : p));
    renewed.push({ ...policies.find((p) => p.id === "harbour-gl")!, id: "harbour-gl-renewal", effectiveDate: "2027-01-11", expiryDate: "2028-01-11", previousPolicyId: "harbour-gl", renewedOn: null });
    expect(certificateStatus(certificates[1], renewed, asOf).value.status).toBe("reissue_needed");
    expect(certificateStatus(certificates[0], renewed, asOf).value.status).toBe("issued"); // auto unaffected
  });
});

describe("Cedar Ridge program", () => {
  const cedar = account("Cedar Ridge Mechanical Ltd.");
  const { policies, layers, requirements } = demoAccountToProgram(cedar, asOf);

  it("has a two-layer tower with a $1M gap", () => {
    const t = analyzeTower(layers).value;
    expect(t.continuous).toBe(false);
    // umbrella attaches at 2M, primary exhausts at 1M → 1M gap
    expect(t.findings).toEqual([expect.objectContaining({ kind: "gap", amount: 1 * M })]);
  });

  it("meets the construction contract's $5M umbrella requirement", () => {
    const rs = checkRequirements(requirements, policies, layers, { countUmbrella: false }).value;
    expect(rs.find((r) => r.requirement.coverage === "Umbrella/Excess")!.status).toBe("meets");
    expect(rs.find((r) => r.requirement.coverage === "General Liability")!.status).toBe("meets");
  });

  it("carries the property adequacy example", () => {
    const pr = cedar.policies.find((p) => p.key === "cedar-pr")!;
    expect([pr.insurableValue, pr.coinsurancePercent, pr.occurrenceLimit, pr.deductible]).toEqual([1 * M, 80, 600_000, 5_000]);
    // with the policy's own $5,000 deductible and a $100,000 loss → payment 70,000, as on the policy page's first load
    const r = coinsurancePayment({ insurableValue: pr.insurableValue!, coinsurancePercent: pr.coinsurancePercent!, carriedLimit: pr.occurrenceLimit!, loss: 100_000, deductible: pr.deductible! }).value;
    expect([r.requiredLimit, r.payment, r.clientAbsorbs, r.additionalLimitNeeded]).toEqual([800_000, 70_000, 30_000, 200_000]);
  });
});

describe("Kestrel property placement", () => {
  it("has three co-insurers whose lines total 100% and premiums total the policy premium", () => {
    const pr = account("Kestrel Precision Components Corp.").policies.find((p) => p.key === "kestrel-pr")!;
    const r = analyzeParticipation(pr.participants.map((x, i) => ({ id: `p${i}`, ...x })), { annualPremium: pr.annualPremium, occurrenceLimit: pr.occurrenceLimit }).value;
    expect([r.totalSignedLine, r.totalPremium, r.findings]).toEqual([100, 420_000, []]);
    expect(pr.sublimits.map((s) => s.name)).toEqual(["Earthquake", "Flood", "Stock in process", "Business interruption"]);
  });
});
