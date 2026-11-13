import { describe, expect, it } from "vitest";
import { forecastAssumptionsSchema, parseForward, parseLookback } from "../dashboard";
import { lostOutcomeSchema, nonRenewedOutcomeSchema, renewedOutcomeSchema } from "../outcome";
import { taskFormSchema } from "../task";
import { customChecklistItemSchema } from "../checklist";
import { noteFormSchema } from "../activity";

const renewed = {
  renewalCarrier: "Northgate Mutual",
  renewalPremium: "108,000",
  renewalExposureAmount: "23,000,000",
  renewalDeductible: "5,000",
  renewalOccurrenceLimit: "1,000,000",
  renewalAggregateLimit: "2,000,000",
  renewalCommissionRate: "15",
};

describe("renewedOutcomeSchema", () => {
  it("parses money strings", () => {
    const r = renewedOutcomeSchema({ occurrenceLimit: true, aggregateLimit: true }).safeParse(renewed);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.renewalPremium).toBe(108000);
      expect(r.data.renewalExposureAmount).toBe(23000000);
    }
  });
  it("requires limits only when the expiring policy had them", () => {
    const blank = { ...renewed, renewalOccurrenceLimit: "", renewalAggregateLimit: "" };
    expect(renewedOutcomeSchema({ occurrenceLimit: true, aggregateLimit: true }).safeParse(blank).success).toBe(false);
    expect(renewedOutcomeSchema({ occurrenceLimit: false, aggregateLimit: false }).safeParse(blank).success).toBe(true);
  });
  it("requires premium, carrier, exposure and deductible", () => {
    const s = renewedOutcomeSchema({ occurrenceLimit: false, aggregateLimit: false });
    for (const key of ["renewalPremium", "renewalCarrier", "renewalExposureAmount", "renewalDeductible"] as const) {
      expect(s.safeParse({ ...renewed, [key]: "" }).success).toBe(false);
    }
    expect(s.safeParse({ ...renewed, renewalPremium: "-1" }).success).toBe(false);
  });
});

describe("lost and non-renewed schemas", () => {
  it("requires a lost reason; competing premium optional", () => {
    expect(lostOutcomeSchema.safeParse({ lostReason: "price", competingPremium: "", details: "" }).success).toBe(true);
    expect(lostOutcomeSchema.safeParse({ lostReason: "", competingPremium: "", details: "" }).success).toBe(false);
    const r = lostOutcomeSchema.safeParse({ lostReason: "price", competingPremium: "22,900", details: "" });
    expect(r.success && r.data.competingPremium).toBe(22900);
  });
  it("requires a non-renewal reason", () => {
    expect(nonRenewedOutcomeSchema.safeParse({ reason: " " }).success).toBe(false);
    expect(nonRenewedOutcomeSchema.safeParse({ reason: "Carrier exiting the class" }).success).toBe(true);
  });
});

describe("task, checklist and note schemas", () => {
  it("validates a task", () => {
    expect(taskFormSchema.safeParse({ title: "Call client", dueDate: "2026-12-01", owner: "", policyId: "" }).success).toBe(true);
    expect(taskFormSchema.safeParse({ title: "", dueDate: "2026-12-01", owner: "", policyId: "" }).success).toBe(false);
    expect(taskFormSchema.safeParse({ title: "x", dueDate: "2026-02-30", owner: "", policyId: "" }).success).toBe(false);
  });
  it("validates checklist items and notes", () => {
    expect(customChecklistItemSchema.safeParse({ label: "Fleet telematics report", required: false }).success).toBe(true);
    expect(customChecklistItemSchema.safeParse({ label: "  ", required: true }).success).toBe(false);
    expect(noteFormSchema.safeParse({ body: "" }).success).toBe(false);
  });
});


describe("dashboard schemas", () => {
  it("parses retention 0–100 and a signed rate change", () => {
    const ok = forecastAssumptionsSchema.safeParse({ retention: "87.5", rateChange: "-5" });
    expect(ok.success && ok.data).toEqual({ retention: 87.5, rateChange: -5 });
    expect(forecastAssumptionsSchema.safeParse({ retention: "101", rateChange: "0" }).success).toBe(false);
    expect(forecastAssumptionsSchema.safeParse({ retention: "-1", rateChange: "0" }).success).toBe(false);
    expect(forecastAssumptionsSchema.safeParse({ retention: "85", rateChange: "-101" }).success).toBe(false);
    expect(forecastAssumptionsSchema.safeParse({ retention: "85", rateChange: "abc" }).success).toBe(false);
    const plus = forecastAssumptionsSchema.safeParse({ retention: "85", rateChange: "+3.5" });
    expect(plus.success && plus.data.rateChange).toBe(3.5);
  });
  it("falls back to 12 months for unknown windows", () => {
    expect([parseLookback("6"), parseLookback("24"), parseLookback("7"), parseLookback("")]).toEqual([6, 24, 12, 12]);
    expect([parseForward("3"), parseForward("6"), parseForward("99")]).toEqual([3, 6, 12]);
  });
});
