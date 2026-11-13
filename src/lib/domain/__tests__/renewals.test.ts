import { describe, expect, it } from "vitest";
import {
  checkUndoOutcome,
  checklistReadiness,
  checklistTemplate,
  getRateMetrics,
  getRenewalStage,
  isTaskOverdue,
  planStandardRenewalTasks,
  planSuccessorTerm,
  rateUnit,
  summarizeByStage,
} from "../renewals";

describe("getRenewalStage", () => {
  const open = "in_progress" as const;
  it.each([
    // [days, expected] — boundaries from the stage rules
    [121, "Not yet due"], // 121 > 120
    [120, "120-day: Strategy"], // 91 ≤ 120 ≤ 120
    [91, "120-day: Strategy"], // lower edge of 91–120
    [90, "90-day: Marketing"], // 61 ≤ 90 ≤ 90
    [61, "90-day: Marketing"], // lower edge of 61–90
    [60, "60-day: Quoting"], // 31 ≤ 60 ≤ 60
    [31, "60-day: Quoting"], // lower edge of 31–60
    [30, "30-day: Binding"], // 1 ≤ 30 ≤ 30
    [1, "30-day: Binding"], // lower edge of 1–30
    [0, "Expired — action required"], // 0 ≤ 0
    [-1, "Expired — action required"], // negative
  ] as const)("%i days → %s", (days, expected) => {
    expect(getRenewalStage(days, open).value).toBe(expected);
  });

  it("not_started follows the same day rules", () => {
    expect(getRenewalStage(45, "not_started").value).toBe("60-day: Quoting"); // 31 ≤ 45 ≤ 60
  });

  it.each(["renewed", "lost", "non_renewed"] as const)("%s is Closed regardless of days", (status) => {
    for (const days of [400, 120, 60, 0, -30]) {
      expect(getRenewalStage(days, status).value).toBe("Closed");
    }
  });

  it("explains the matched rule", () => {
    expect(getRenewalStage(75, open).math.steps.matched).toBe("61 ≤ days ≤ 90");
  });
});

describe("summarizeByStage", () => {
  it("counts and sums premium per stage in pipeline order, zeros included", () => {
    const r = summarizeByStage([
      { stage: "30-day: Binding", premium: 100.1 },
      { stage: "30-day: Binding", premium: 200.2 },
      { stage: "Closed", premium: 50 },
    ]);
    expect(r.value).toHaveLength(7);
    expect(r.value[0]).toEqual({ stage: "Not yet due", count: 0, premium: 0 });
    // 100.10 + 200.20 = 300.30 (10,010 + 20,020 = 30,030 cents)
    expect(r.value[4]).toEqual({ stage: "30-day: Binding", count: 2, premium: 300.3 });
    expect(r.value[6]).toEqual({ stage: "Closed", count: 1, premium: 50 });
  });
});

describe("checklistTemplate", () => {
  it("gives four common items for General Liability", () => {
    const r = checklistTemplate("General Liability");
    // 4 common + 0 line-specific = 4
    expect(r.value.map((i) => i.label)).toEqual([
      "Updated exposure figures",
      "Five-year loss runs",
      "Signed application",
      "Renewal questionnaire",
    ]);
  });
  it.each([
    ["Property", "Statement of values"],
    ["Commercial Auto", "Driver and vehicle list"],
    ["Workers Compensation", "Payroll by class"],
    ["Umbrella/Excess", "Underlying policy schedule"],
    ["Cyber", "Security questionnaire"],
  ] as const)("adds the %s item", (line, item) => {
    const r = checklistTemplate(line);
    // 4 common + 1 line-specific = 5
    expect(r.value).toHaveLength(5);
    expect(r.value[4]).toEqual({ label: item, source: "line", required: true });
  });
});

describe("checklistReadiness", () => {
  it("labels partial progress", () => {
    // 6 ÷ 8 = 0.75
    expect(checklistReadiness(6, 8).value).toEqual({ done: 6, total: 8, ratio: 0.75, label: "6 of 8 ready", readyToMarket: false });
  });
  it("is ready to market only at 100%", () => {
    // 8 ÷ 8 = 1
    expect(checklistReadiness(8, 8).value.readyToMarket).toBe(true);
    expect(checklistReadiness(8, 8).value.label).toBe("Ready to market");
    // 7 ÷ 8 = 0.875 → not ready
    expect(checklistReadiness(7, 8).value.readyToMarket).toBe(false);
  });
  it("handles an empty checklist", () => {
    expect(checklistReadiness(0, 0).value).toEqual({ done: 0, total: 0, ratio: null, label: "No checklist items", readyToMarket: false });
  });
  it("rejects impossible counts", () => {
    expect(() => checklistReadiness(3, 2)).toThrow();
  });
});

describe("isTaskOverdue", () => {
  const asOf = "2026-11-12";
  it("is overdue when due before the as-of date and not done", () => {
    // 2026-11-11 is 1 day before → −1 < 0
    expect(isTaskOverdue(asOf, "2026-11-11", false).value).toBe(true);
  });
  it("is not overdue when done, or due on/after the as-of date", () => {
    expect(isTaskOverdue(asOf, "2026-11-11", true).value).toBe(false);
    expect(isTaskOverdue(asOf, "2026-11-12", false).value).toBe(false); // 0 days, not < 0
    expect(isTaskOverdue(asOf, "2026-12-01", false).value).toBe(false);
  });
});

describe("planStandardRenewalTasks", () => {
  // Expiry 2027-01-11 is 60 days after 2026-11-12 (18 left in Nov + 31 Dec + 11 Jan).
  const asOf = "2026-11-12";
  const expiry = "2027-01-11";

  it("creates future tasks and skips past ones", () => {
    const r = planStandardRenewalTasks(asOf, expiry, []);
    // −120 → 2026-09-13 (60 days before as-of) → past
    // −90  → 2026-10-13 (30 days before as-of) → past
    // −60  → 2026-11-12 (the as-of date itself) → create
    // −30  → 2026-12-12 (30 days after as-of) → create
    expect(r.value.skippedPast.map((t) => [t.title, t.dueDate])).toEqual([
      ["Strategy meeting", "2026-09-13"],
      ["Submit to market", "2026-10-13"],
    ]);
    expect(r.value.create.map((t) => [t.title, t.dueDate])).toEqual([
      ["Compare quotes", "2026-11-12"],
      ["Bind and issue", "2026-12-12"],
    ]);
    expect(r.value.skippedExisting).toEqual([]);
  });

  it("skips titles that already exist (case-insensitive)", () => {
    const r = planStandardRenewalTasks(asOf, expiry, ["bind and issue"]);
    // 2 past + 1 existing + 1 created = 4
    expect(r.value.create.map((t) => t.title)).toEqual(["Compare quotes"]);
    expect(r.value.skippedExisting.map((t) => t.title)).toEqual(["Bind and issue"]);
  });

  it("creates all four for a far expiry", () => {
    // expiry 2027-06-01; −120 → 2027-02-01, still after 2026-11-12
    expect(planStandardRenewalTasks(asOf, "2027-06-01", []).value.create).toHaveLength(4);
  });
});

describe("planSuccessorTerm", () => {
  it("starts on the old expiry and runs 12 months", () => {
    // 2026-10-13 + 12 months = 2027-10-13; 2027 has no Feb 29 in range → 365 days
    const r = planSuccessorTerm("2026-10-13");
    expect(r.value).toEqual({ effectiveDate: "2026-10-13", expiryDate: "2027-10-13" });
    expect(r.math.steps.termDays).toBe(365);
  });
  it("spans a leap day", () => {
    // 2027-06-01 → 2028-06-01 includes 2028-02-29 → 366 days
    expect(planSuccessorTerm("2027-06-01").math.steps.termDays).toBe(366);
  });
});

describe("checkUndoOutcome", () => {
  it("allows a clean successor", () => {
    expect(checkUndoOutcome({ successorHasOutcome: false, successorClaimCount: 0 }).value.allowed).toBe(true);
  });
  it("refuses when the successor has its own outcome or claims", () => {
    expect(checkUndoOutcome({ successorHasOutcome: true, successorClaimCount: 0 }).value.allowed).toBe(false);
    expect(checkUndoOutcome({ successorHasOutcome: false, successorClaimCount: 2 }).value.allowed).toBe(false);
  });
});

describe("rateUnit", () => {
  it("uses $1,000 for revenue and payroll, 100 for square feet, 1 otherwise", () => {
    expect(rateUnit("revenue")).toEqual({ divisor: 1000, label: "per $1,000 of revenue" });
    expect(rateUnit("payroll").divisor).toBe(1000);
    expect(rateUnit("square_feet")).toEqual({ divisor: 100, label: "per 100 sq ft" });
    expect(rateUnit("vehicles")).toEqual({ divisor: 1, label: "per vehicle" });
    expect(rateUnit("employees")).toEqual({ divisor: 1, label: "per employee" });
  });
});

describe("getRateMetrics", () => {
  const expiring = { premium: 100_000, exposureAmount: 20_000_000, exposureBasis: "revenue" as const };
  const renewal = { premium: 108_000, exposureAmount: 23_000_000, exposureBasis: "revenue" as const };

  it("matches the specified example", () => {
    const r = getRateMetrics(expiring, renewal).value;
    // expiring rate = 100,000 ÷ (20,000,000 ÷ 1,000) = 100,000 ÷ 20,000 = 5.0000 per $1,000
    expect(r.expiringRate).toBe(5);
    // renewal rate = 108,000 ÷ (23,000,000 ÷ 1,000) = 108,000 ÷ 23,000 = 4.695652…
    expect(Number(r.renewalRate!.toFixed(6))).toBe(4.695652);
    // premium change = 108,000 ÷ 100,000 − 1 = 1.08 − 1 = 0.08
    expect(Number(r.premiumChange!.toFixed(6))).toBe(0.08);
    // exposure change = 23,000,000 ÷ 20,000,000 − 1 = 1.15 − 1 = 0.15
    expect(Number(r.exposureChange!.toFixed(6))).toBe(0.15);
    // rate change = 4.695652 ÷ 5 − 1 = 0.939130 − 1 = −0.060870
    expect(Number(r.rateChange!.toFixed(6))).toBe(-0.06087);
    expect(r.unitLabel).toBe("per $1,000 of revenue");
    expect(r.sentence).toBe("Premium rose 8.0% while exposure rose 15.0%, so the rate fell 6.1%.");
  });

  it("satisfies (1 + premium change) = (1 + rate change) × (1 + exposure change)", () => {
    const r = getRateMetrics(expiring, renewal).value;
    // 1.08 vs 0.939130 × 1.15 = 1.08
    expect(r.identity!.holds).toBe(true);
    expect(r.identity!.difference).toBeLessThan(0.0001);
    expect(r.warning).toBeNull();
  });

  it("shows each division to four decimals in the math", () => {
    const lines = getRateMetrics(expiring, renewal).math.steps.lines as string[];
    expect(lines).toContain(
      "Expiring rate = 100,000.00 ÷ (20,000,000.00 ÷ 1,000) = 100,000.00 ÷ 20,000.0000 = 5.0000 per $1,000 of revenue",
    );
    expect(lines).toContain("Premium change = 108,000.00 ÷ 100,000.00 − 1 = 0.0800");
    expect(lines).toContain("Rate change = 4.6957 ÷ 5.0000 − 1 = −0.0609");
  });

  it("keeps premium change when exposure is missing or zero", () => {
    for (const exposureAmount of [null, 0]) {
      const r = getRateMetrics(expiring, { ...renewal, exposureAmount }).value;
      expect(Number(r.premiumChange!.toFixed(6))).toBe(0.08); // 108,000 ÷ 100,000 − 1
      expect(r.rateChange).toBeNull();
      expect(r.exposureChange).toBeNull();
      expect(r.rateUnavailable).toBe("exposure missing");
      expect(r.sentence).toBe("Premium rose 8.0%; rate change is unavailable (exposure missing).");
    }
  });

  it("refuses to compare rates on different exposure bases", () => {
    const r = getRateMetrics(expiring, { ...renewal, exposureBasis: "payroll" }).value;
    expect(r.rateUnavailable).toBe("exposure basis differs");
    expect(r.rateChange).toBeNull();
  });

  it("rates square feet per 100 and vehicles per unit", () => {
    // 52,100 ÷ (24,500 ÷ 100) = 52,100 ÷ 245 = 212.653061…
    const sq = getRateMetrics(
      { premium: 52_100, exposureAmount: 24_500, exposureBasis: "square_feet" },
      { premium: 52_100, exposureAmount: 24_500, exposureBasis: "square_feet" },
    ).value;
    expect(Number(sq.expiringRate!.toFixed(4))).toBe(212.6531);
    expect(sq.rateChange).toBe(0); // same premium, same exposure → 1 − 1 = 0
    expect(sq.sentence).toBe("Premium was unchanged while exposure was unchanged, so the rate was unchanged.");
    // 61,200 ÷ 34 vehicles = 1,800 per vehicle; 66,000 ÷ 30 = 2,200 → 2,200 ÷ 1,800 − 1 = 0.222222
    const cars = getRateMetrics(
      { premium: 61_200, exposureAmount: 34, exposureBasis: "vehicles" },
      { premium: 66_000, exposureAmount: 30, exposureBasis: "vehicles" },
    ).value;
    expect(cars.expiringRate).toBe(1800);
    expect(cars.renewalRate).toBe(2200);
    expect(Number(cars.rateChange!.toFixed(6))).toBe(0.222222);
    // premium 66,000 ÷ 61,200 − 1 = 0.078431 (7.8%); exposure 30 ÷ 34 − 1 = −0.117647 (−11.8%)
    expect(cars.sentence).toBe("Premium rose 7.8% while exposure fell 11.8%, so the rate rose 22.2%.");
  });
});
