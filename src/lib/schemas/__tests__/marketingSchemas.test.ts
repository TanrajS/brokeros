import { describe, expect, it } from "vitest";
import { declineFormSchema, quoteFormSchema, submissionFormSchema } from "../marketing";

const asOf = "2026-11-12";

describe("marketing schemas", () => {
  it("validates a submission's sent date against the as-of date", () => {
    const s = submissionFormSchema(asOf);
    expect(s.safeParse({ carrier: "Pacific Crest", sentOn: "", notes: "" }).success).toBe(true);
    expect(s.safeParse({ carrier: "Pacific Crest", sentOn: "2026-11-13", notes: "" }).success).toBe(false);
    expect(s.safeParse({ carrier: " ", sentOn: "", notes: "" }).success).toBe(false);
  });

  it("requires a decline reason", () => {
    const s = declineFormSchema(asOf);
    expect(s.safeParse({ declinedReason: "class_of_business", respondedOn: asOf, notes: "" }).success).toBe(true);
    expect(s.safeParse({ declinedReason: "", respondedOn: asOf, notes: "" }).success).toBe(false);
  });

  const quote = {
    quotedPremium: "142,000",
    occurrenceLimit: "1,000,000",
    aggregateLimit: "2,000,000",
    deductible: "10,000",
    endorsements: ["additional_insured"],
    commissionRate: "15",
    exposureAmount: "",
    subjectivities: "",
    validUntil: "2026-12-15",
    isIncumbentRenewal: false,
    respondedOn: asOf,
  };
  it("parses a quote and allows a past valid-until date (flagged later, not rejected)", () => {
    const r = quoteFormSchema(asOf).safeParse(quote);
    expect(r.success && r.data).toMatchObject({ quotedPremium: 142_000, commissionRate: 15, exposureAmount: null });
    expect(quoteFormSchema(asOf).safeParse({ ...quote, validUntil: "2026-10-01" }).success).toBe(true);
  });
  it("rejects bad quote amounts and dates", () => {
    const s = quoteFormSchema(asOf);
    expect(s.safeParse({ ...quote, quotedPremium: "0" }).success).toBe(false);
    expect(s.safeParse({ ...quote, commissionRate: "120" }).success).toBe(false);
    expect(s.safeParse({ ...quote, deductible: "-5" }).success).toBe(false);
    expect(s.safeParse({ ...quote, aggregateLimit: "500,000" }).success).toBe(false);
    expect(s.safeParse({ ...quote, respondedOn: "2026-11-13" }).success).toBe(false);
  });
});
