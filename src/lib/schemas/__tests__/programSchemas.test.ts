import { describe, expect, it } from "vitest";
import { adequacyFormSchema, certificateFormSchema, participantFormSchema, requirementFormSchema, sublimitFormSchema, towerLayerFormSchema } from "../program";

describe("program schemas", () => {
  it("parses a tower layer and rejects a zero limit", () => {
    const ok = towerLayerFormSchema.safeParse({ lineGroup: "gl", layerType: "umbrella", carrier: "Boreal", attachment: "1,000,000", limit: "5,000,000", premium: "22,000", policyId: "" });
    expect(ok.success && ok.data).toMatchObject({ attachment: 1_000_000, limit: 5_000_000, premium: 22_000, policyId: null });
    expect(towerLayerFormSchema.safeParse({ lineGroup: "gl", layerType: "primary", carrier: "A", attachment: "0", limit: "0", premium: "1", policyId: "" }).success).toBe(false);
  });

  it("requires an occurrence limit except for Workers Compensation", () => {
    const base = { contractName: "C", counterparty: "X", coverage: "General Liability", requiredOccurrence: "", requiredAggregate: "", requiredEndorsements: [], notes: "" };
    expect(requirementFormSchema.safeParse(base).success).toBe(false);
    expect(requirementFormSchema.safeParse({ ...base, coverage: "Workers Compensation" }).success).toBe(true);
    expect(requirementFormSchema.safeParse({ ...base, requiredOccurrence: "2,000,000", requiredEndorsements: ["additional_insured"] }).success).toBe(true);
  });

  it("validates certificates against the as-of date", () => {
    const s = certificateFormSchema("2026-11-12");
    const base = { holder: "H", operationsDescription: "", coverages: ["General Liability"], requiredBy: "", issuedOn: "", notes: "" };
    expect(s.safeParse(base).success).toBe(true);
    expect(s.safeParse({ ...base, issuedOn: "2026-11-13" }).success).toBe(false);
    expect(s.safeParse({ ...base, coverages: [] }).success).toBe(false);
  });

  it("validates participants and sub-limits", () => {
    expect(participantFormSchema.safeParse({ carrier: "A", role: "lead", signedLine: "50", premium: "", notes: "" }).success).toBe(true);
    expect(participantFormSchema.safeParse({ carrier: "A", role: "lead", signedLine: "0", premium: "", notes: "" }).success).toBe(false);
    expect(participantFormSchema.safeParse({ carrier: "A", role: "lead", signedLine: "101", premium: "", notes: "" }).success).toBe(false);
    expect(sublimitFormSchema.safeParse({ name: "Flood", limit: "", deductible: "", notes: "" }).success).toBe(false);
    expect(sublimitFormSchema.safeParse({ name: "Flood", limit: "2,000,000", deductible: "", notes: "" }).success).toBe(true);
  });

  it("validates adequacy inputs", () => {
    const ok = adequacyFormSchema.safeParse({ insurableValue: "1,000,000", coinsurancePercent: "80", carriedLimit: "600,000", loss: "100,000", deductible: "5,000" });
    expect(ok.success && ok.data.coinsurancePercent).toBe(80);
    expect(adequacyFormSchema.safeParse({ insurableValue: "1,000,000", coinsurancePercent: "85", carriedLimit: "1", loss: "1", deductible: "0" }).success).toBe(false);
  });
});
