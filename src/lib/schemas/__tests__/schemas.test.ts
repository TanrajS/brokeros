import { describe, expect, it } from "vitest";
import { policyFormSchema, emptyPolicyForm } from "../policy";
import { accountFormSchema } from "../account";
import { contactFormSchema } from "../contact";

const valid = {
  ...emptyPolicyForm("2026-01-01", "2027-01-01"),
  carrier: "Northgate Mutual",
  annualPremium: "48,000",
  commissionRate: "12.5",
  occurrenceLimit: "1,000,000",
  aggregateLimit: "2000000",
};

describe("policyFormSchema", () => {
  it("parses currency and percent strings into numbers", () => {
    const r = policyFormSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.annualPremium).toBe(48000);
    expect(r.data.commissionRate).toBe(12.5);
    expect(r.data.occurrenceLimit).toBe(1000000);
    expect(r.data.aggregateLimit).toBe(2000000);
    expect(r.data.deductible).toBeNull();
    expect(r.data.policyNumber).toBeNull();
    expect(r.data.previousPolicyId).toBeNull();
  });

  it("rejects expiry on or before effective", () => {
    const r = policyFormSchema.safeParse({ ...valid, expiryDate: "2026-01-01" });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.some((i) => i.path[0] === "expiryDate")).toBe(true);
  });

  it("rejects negative premium, text, and percent over 100", () => {
    expect(policyFormSchema.safeParse({ ...valid, annualPremium: "-1" }).success).toBe(false);
    expect(policyFormSchema.safeParse({ ...valid, annualPremium: "lots" }).success).toBe(false);
    expect(policyFormSchema.safeParse({ ...valid, commissionRate: "101" }).success).toBe(false);
    expect(policyFormSchema.safeParse({ ...valid, commissionRate: "" }).success).toBe(false);
  });

  it("requires carrier and a valid line of business", () => {
    expect(policyFormSchema.safeParse({ ...valid, carrier: "  " }).success).toBe(false);
    expect(policyFormSchema.safeParse({ ...valid, lineOfBusiness: "Marine" }).success).toBe(false);
  });
});

describe("accountFormSchema", () => {
  it("accepts a minimal account and normalises blanks to null", () => {
    const r = accountFormSchema.safeParse({
      name: "Cedar Ridge Mechanical Ltd.",
      industry: "construction",
      annualRevenue: "23,000,000",
      employeeCount: "140",
      province: "BC",
      producer: "",
      accountManager: "",
      status: "active",
      notes: "",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.annualRevenue).toBe(23000000);
    expect(r.data.employeeCount).toBe(140);
    expect(r.data.producer).toBeNull();
  });
  it("rejects a non-integer employee count", () => {
    expect(
      accountFormSchema.safeParse({
        name: "X",
        industry: "retail",
        annualRevenue: "",
        employeeCount: "12.5",
        province: "ON",
        producer: "",
        accountManager: "",
        status: "prospect",
        notes: "",
      }).success,
    ).toBe(false);
  });
});

describe("contactFormSchema", () => {
  it("validates email format and lowercases it", () => {
    expect(contactFormSchema.safeParse({ name: "A", role: "", email: "nope", phone: "" }).success).toBe(false);
    const ok = contactFormSchema.safeParse({ name: "A", role: "", email: "Dana@Example.com", phone: "" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.email).toBe("dana@example.com");
    const blank = contactFormSchema.safeParse({ name: "A", role: "", email: "", phone: "" });
    expect(blank.success).toBe(true);
    if (blank.success) expect(blank.data.email).toBeNull();
  });
});
