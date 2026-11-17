import { describe, expect, it } from "vitest";
import { buildDemoBook } from "../demoBookData";
import { isRetiredDemoAccountName } from "@/lib/domain/book";
import { daysBetween } from "@/lib/domain/dates";
import { checklistTemplate, getRenewalStage, getRateMetrics, isTaskOverdue } from "@/lib/domain/renewals";

const asOf = "2026-11-12";
const book = buildDemoBook(asOf);
const allPolicies = book.flatMap((a) => a.policies.map((p) => ({ account: a.name, ...p })));
/** Current terms: prior-year terms are kept for history and excluded from the date-range rules. */
const currentPolicies = allPolicies.filter((p) => !p.priorTerm);

describe("buildDemoBook (v1.4: ten focused accounts)", () => {
  it("has exactly 10 accounts across the six industries, none of them a retired v1.3 name", () => {
    expect(book).toHaveLength(10);
    // v1.5.1: Ashgrove, Kestrel, Prairie, Bluewater, Copperfield, Maple and Tidewater are gone for good
    expect(book.filter((a) => isRetiredDemoAccountName(a.name))).toEqual([]);
    for (const core of ["Harbourline Foods Inc.", "Cedar Ridge Mechanical Ltd.", "Pacific Northwest Terminals Ltd.", "Kootenay Alpine Resorts Inc."]) expect(book.some((a) => a.name === core)).toBe(true);
    const industries = new Set(book.map((a) => a.industry));
    for (const i of ["construction", "manufacturing", "hospitality", "professional services", "transportation", "retail"]) {
      expect(industries.has(i as never)).toBe(true);
    }
  });

  it("has about 37 current policies, 2 to 7 per account, and no empty accounts", () => {
    expect(currentPolicies.length).toBeGreaterThanOrEqual(34);
    expect(currentPolicies.length).toBeLessThanOrEqual(40);
    for (const a of book) {
      const current = a.policies.filter((p) => !p.priorTerm);
      expect(current.length).toBeGreaterThanOrEqual(2);
      // Harbourview holds 7 current rows: two renewed today, their two successors, cyber and the lost auto.
      expect(current.length).toBeLessThanOrEqual(7);
    }
  });

  it("keeps premiums, commissions and expiries within the specified ranges", () => {
    for (const p of currentPolicies) {
      expect(p.annualPremium).toBeGreaterThanOrEqual(6_000);
      expect(p.annualPremium).toBeLessThanOrEqual(755_000);
      expect(p.commissionRate).toBeGreaterThanOrEqual(10);
      expect(p.commissionRate).toBeLessThanOrEqual(17.5);
      const days = daysBetween(asOf, p.expiryDate).value;
      expect(days).toBeGreaterThanOrEqual(-30);
      expect(days).toBeLessThanOrEqual(400);
      expect(days).toBe(p.expiryOffsetDays);
      // every term is a year, or a longer co-terminous term (12 to 17 months) written to a common renewal date
      const term = daysBetween(p.effectiveDate, p.expiryDate).value;
      expect(term).toBeGreaterThanOrEqual(365);
      expect(term).toBeLessThanOrEqual(520);
    }
  });

  it("includes the required exact day offsets", () => {
    const offsets = new Set(currentPolicies.map((p) => p.expiryOffsetDays));
    for (const required of [120, 121, 90, 60, 30, 0]) expect(offsets.has(required)).toBe(true);
    expect(allPolicies.some((p) => p.expiryOffsetDays < 0)).toBe(true);
  });

  it("shapes Cedar Ridge Mechanical exactly as specified", () => {
    const a = book.find((x) => x.name === "Cedar Ridge Mechanical Ltd.")!;
    expect(a.industry).toBe("construction");
    expect(a.annualRevenue).toBe(23_000_000);
    expect(a.employeeCount).toBe(140);
    const gl = a.policies.find((p) => p.lineOfBusiness === "General Liability" && !p.priorTerm)!;
    expect(gl.occurrenceLimit).toBe(1_000_000);
    expect(gl.aggregateLimit).toBe(2_000_000);
    expect(gl.deductible).toBe(5_000);
    expect(gl.annualPremium).toBe(108_000);
    expect(gl.commissionRate).toBe(15);
    expect(gl.exposureBasis).toBe("revenue");
    expect(gl.endorsements).toEqual(["additional_insured"]);
  });

  it("shapes Harbourline Foods exactly as specified", () => {
    const a = book.find((x) => x.name === "Harbourline Foods Inc.")!;
    expect(a.industry).toBe("manufacturing");
    expect(a.annualRevenue).toBe(25_000_000);
    expect(a.employeeCount).toBe(210);
    const gl = a.policies.find((p) => p.lineOfBusiness === "General Liability" && !p.priorTerm)!;
    expect(gl.occurrenceLimit).toBe(1_000_000);
    expect(gl.aggregateLimit).toBe(2_000_000);
    expect(gl.deductible).toBe(10_000);
    expect(gl.annualPremium).toBe(150_000);
    expect(gl.commissionRate).toBe(12.5);
    expect(gl.exposureBasis).toBe("revenue");
    expect(gl.exposureAmount).toBe(25_000_000);
    // 2026-11-12 + 60 days = 2027-01-11 (18 days left in Nov, 31 in Dec, 11 in Jan)
    expect(gl.expiryDate).toBe("2027-01-11");
    expect(gl.expiryOffsetDays).toBe(60);
  });

  it("uses only fictional .example emails, unique policy numbers and no Workers Compensation", () => {
    for (const a of book) for (const c of a.contacts) if (c.email) expect(c.email.endsWith(".example")).toBe(true);
    const numbers = allPolicies.map((p) => p.policyNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(allPolicies.some((p) => (p.lineOfBusiness as string) === "Workers Compensation")).toBe(false);
  });

  it("is deterministic for the same as-of date", () => {
    expect(buildDemoBook(asOf)).toEqual(book);
  });
});

describe("buildDemoBook — renewals data", () => {
  const stageOf = (p: (typeof allPolicies)[number]) => getRenewalStage(daysBetween(asOf, p.expiryDate).value, p.renewalStatus).value;

  it("chains Cedar Ridge's GL to a prior-year $100,000 on $20,000,000 term", () => {
    const cedar = book.find((a) => a.name === "Cedar Ridge Mechanical Ltd.")!;
    const current = cedar.policies.find((p) => p.key === "cedar-gl")!;
    const prior = cedar.policies.find((p) => p.key === "cedar-gl-prior")!;
    expect(current.previousKey).toBe("cedar-gl-prior");
    expect(prior.annualPremium).toBe(100_000);
    expect(prior.exposureAmount).toBe(20_000_000);
    expect(prior.renewalStatus).toBe("renewed");
    expect(prior.outcome).toMatchObject({ type: "renewed", successorKey: "cedar-gl" });
    expect(prior.expiryDate).toBe(current.effectiveDate);
    // 108,000 ÷ 23,000 = 4.695652 vs 100,000 ÷ 20,000 = 5 → 0.939130 − 1 = −0.060870
    const m = getRateMetrics(
      { premium: prior.annualPremium, exposureAmount: prior.exposureAmount, exposureBasis: prior.exposureBasis },
      { premium: current.annualPremium, exposureAmount: current.exposureAmount, exposureBasis: current.exposureBasis },
    ).value;
    expect(m.sentence).toBe("Premium rose 8.0% while exposure rose 15.0%, so the rate fell 6.1%.");
  });

  it("carries 55 outcomes: 51 renewed with successors, 3 lost to price, 1 non-renewed", () => {
    const withOutcome = allPolicies.filter((p) => p.outcome);
    expect(withOutcome).toHaveLength(55);
    const renewed = withOutcome.filter((p) => p.outcome!.type === "renewed");
    expect(renewed).toHaveLength(51);
    expect(withOutcome.filter((p) => p.outcome!.type === "non_renewed")).toHaveLength(1);
    for (const r of renewed) {
      const o = r.outcome as { successorKey: string };
      const successor = allPolicies.find((p) => p.key === o.successorKey)!;
      expect(successor.previousKey).toBe(r.key);
      // Northwind's property chain ends in the carrier's non-renewal
      expect(["not_started", "in_progress", "renewed", "non_renewed"]).toContain(successor.renewalStatus);
      expect(successor.effectiveDate).toBe(r.expiryDate);
    }
    const lost = withOutcome.filter((p) => p.outcome!.type === "lost");
    expect(lost).toHaveLength(3);
    for (const l of lost) {
      expect(l.outcome).toMatchObject({ lostReason: "price" });
      expect(l.renewalStatus).toBe("lost");
    }
    const closed = allPolicies.filter((p) => ["renewed", "lost", "non_renewed"].includes(p.renewalStatus));
    expect(closed.map((p) => p.key).sort()).toEqual(withOutcome.map((p) => p.key).sort());
  });

  it("gives about a third of open policies a partly completed checklist, plus one ready to market", () => {
    const open = currentPolicies.filter((p) => !["renewed", "lost", "non_renewed"].includes(p.renewalStatus));
    const partial = open.filter((p) => p.checklist && p.checklist.some((i) => i.done) && p.checklist.some((i) => !i.done));
    const ratio = partial.length / open.length;
    expect(ratio).toBeGreaterThanOrEqual(0.25);
    expect(ratio).toBeLessThanOrEqual(0.4);
    const complete = allPolicies.filter((p) => p.checklist && p.checklist.every((i) => i.done));
    expect(complete).toHaveLength(1);
    for (const p of allPolicies) {
      if (p.checklist) expect(p.checklist.map((i) => i.label)).toEqual(checklistTemplate(p.lineOfBusiness).value.map((i) => i.label));
    }
  });

  it("has overdue tasks on several policies", () => {
    const overdueByPolicy = allPolicies.filter((p) => p.tasks.some((t) => isTaskOverdue(asOf, t.dueDate, t.done).value));
    expect(overdueByPolicy.length).toBeGreaterThanOrEqual(3);
    // Harbourline GL: expiry +60, "Submit to market" due 60 − 90 = −30 days and not done → overdue
    const harbour = allPolicies.find((p) => p.account === "Harbourline Foods Inc." && p.lineOfBusiness === "General Liability" && !p.priorTerm)!;
    const submit = harbour.tasks.find((t) => t.title === "Submit to market")!;
    expect(daysBetween(asOf, submit.dueDate).value).toBe(-30);
    expect(isTaskOverdue(asOf, submit.dueDate, submit.done).value).toBe(true);
  });

  it("puts policies in every stage except Expired on first load", () => {
    const stages = new Set(allPolicies.map(stageOf));
    expect(stages.size).toBe(6);
    expect(stages.has("Expired — action required")).toBe(false);
  });

  it("writes an activity for each outcome and the completed checklist", () => {
    const acts = book.flatMap((a) => a.activities);
    expect(acts.filter((a) => a.kind === "outcome_recorded")).toHaveLength(55);
    expect(acts.filter((a) => a.kind === "checklist_complete")).toHaveLength(1);
  });

  it("gives the four fully populated accounts documents in all four folders and the others a proposal and a submission", () => {
    const full = ["Harbourline Foods Inc.", "Cedar Ridge Mechanical Ltd.", "Pacific Northwest Terminals Ltd.", "Kootenay Alpine Resorts Inc."];
    for (const a of book) {
      const types = new Set(a.documents.map((d) => d.docType));
      if (full.includes(a.name)) {
        expect([...types].sort()).toEqual(["certificate", "policy_document", "proposal", "submission"]);
        expect(a.documents.find((d) => d.docType === "certificate")!.certificate).toBeDefined();
        // every Property policy on a fully populated account carries a deductible schedule
        for (const p of a.policies.filter((x) => x.lineOfBusiness === "Property" && !x.priorTerm)) expect(p.deductibles.length).toBeGreaterThan(0);
      } else {
        expect(types.has("proposal") && types.has("submission")).toBe(true);
      }
      for (const d of a.documents.filter((x) => x.docType === "submission")) expect(d.markets.length).toBeGreaterThan(0);
      expect(new Set(a.documents.map((d) => d.key)).size).toBe(a.documents.length);
    }
  });
});
