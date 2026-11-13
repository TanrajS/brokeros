/**
 * Renewal business rules (v0.2). Pure: no React, no database, no clock.
 * Every exported calculation returns { value, math }.
 */
import type { ExposureBasis, LineOfBusiness, RenewalStatus } from "@/lib/constants";
import { addDays, addMonths, daysBetween } from "./dates";
import type { Calc, ISODate } from "./types";

/* ------------------------------------------------------------------ */
/* Stages                                                              */
/* ------------------------------------------------------------------ */

/** In pipeline order: the board shows one column per stage, left to right. */
export const RENEWAL_STAGES = [
  "Not yet due",
  "120-day: Strategy",
  "90-day: Marketing",
  "60-day: Quoting",
  "30-day: Binding",
  "Expired — action required",
  "Closed",
] as const;
export type RenewalStage = (typeof RENEWAL_STAGES)[number];

/** Plain-English rules, in the order they are checked. Rendered in the Stage rules panel. */
export const STAGE_RULES: { stage: RenewalStage; rule: string }[] = [
  { stage: "Closed", rule: "Renewal status is renewed, lost or non-renewed, whatever the days to expiry." },
  { stage: "Not yet due", rule: "More than 120 days to expiry." },
  { stage: "120-day: Strategy", rule: "91 to 120 days to expiry, inclusive." },
  { stage: "90-day: Marketing", rule: "61 to 90 days to expiry, inclusive." },
  { stage: "60-day: Quoting", rule: "31 to 60 days to expiry, inclusive." },
  { stage: "30-day: Binding", rule: "1 to 30 days to expiry, inclusive." },
  { stage: "Expired — action required", rule: "0 days (expires on the as-of date) or already expired." },
];

const CLOSED: readonly RenewalStatus[] = ["renewed", "lost", "non_renewed"];

/** The renewal stage for a policy, from days to expiry (counted from the as-of date) and its renewal status. */
export function getRenewalStage(daysToExpiry: number, renewalStatus: RenewalStatus): Calc<RenewalStage> {
  if (!Number.isInteger(daysToExpiry)) throw new Error(`Expected whole days, received ${daysToExpiry}`);
  let value: RenewalStage;
  let matched: string;
  if (CLOSED.includes(renewalStatus)) {
    value = "Closed";
    matched = `status ${renewalStatus} is closed`;
  } else if (daysToExpiry > 120) {
    value = "Not yet due";
    matched = "days > 120";
  } else if (daysToExpiry >= 91) {
    value = "120-day: Strategy";
    matched = "91 ≤ days ≤ 120";
  } else if (daysToExpiry >= 61) {
    value = "90-day: Marketing";
    matched = "61 ≤ days ≤ 90";
  } else if (daysToExpiry >= 31) {
    value = "60-day: Quoting";
    matched = "31 ≤ days ≤ 60";
  } else if (daysToExpiry >= 1) {
    value = "30-day: Binding";
    matched = "1 ≤ days ≤ 30";
  } else {
    value = "Expired — action required";
    matched = "days ≤ 0";
  }
  return {
    value,
    math: {
      inputs: { daysToExpiry, renewalStatus },
      formula: "closed status → Closed; otherwise >120 Not yet due, 91–120 Strategy, 61–90 Marketing, 31–60 Quoting, 1–30 Binding, ≤0 Expired",
      steps: { matched, stage: value },
    },
  };
}

export interface StageSummaryRow {
  stage: RenewalStage;
  count: number;
  premium: number;
}

/** Count and expiring premium per stage, every stage present (zeros included), in pipeline order. */
export function summarizeByStage(items: { stage: RenewalStage; premium: number }[]): Calc<StageSummaryRow[]> {
  const totals = new Map<RenewalStage, { count: number; cents: number }>(RENEWAL_STAGES.map((s) => [s, { count: 0, cents: 0 }]));
  for (const it of items) {
    if (!Number.isFinite(it.premium)) throw new Error(`Expected a finite premium, received ${it.premium}`);
    const t = totals.get(it.stage)!;
    t.count += 1;
    t.cents += Math.round(it.premium * 100);
  }
  const value = RENEWAL_STAGES.map((stage) => {
    const t = totals.get(stage)!;
    return { stage, count: t.count, premium: t.cents / 100 };
  });
  return {
    value,
    math: {
      inputs: { itemCount: items.length },
      formula: "for each stage: count = number of policies in it; premium = sum of their expiring premiums (summed in cents)",
      steps: { perStage: value },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Readiness checklist                                                 */
/* ------------------------------------------------------------------ */

export const COMMON_CHECKLIST_ITEMS = [
  "Updated exposure figures",
  "Five-year loss runs",
  "Signed application",
  "Renewal questionnaire",
] as const;

export const LINE_CHECKLIST_ITEMS: Partial<Record<LineOfBusiness, string>> = {
  Property: "Statement of values",
  "Commercial Auto": "Driver and vehicle list",
  "Workers Compensation": "Payroll by class",
  "Umbrella/Excess": "Underlying policy schedule",
  Cyber: "Security questionnaire",
};

export interface ChecklistTemplateItem {
  label: string;
  source: "common" | "line";
  required: true;
}

/** The standard checklist for a line: four common items, plus one line-specific item where the line has one. */
export function checklistTemplate(line: LineOfBusiness): Calc<ChecklistTemplateItem[]> {
  const lineItem = LINE_CHECKLIST_ITEMS[line] ?? null;
  const value: ChecklistTemplateItem[] = [
    ...COMMON_CHECKLIST_ITEMS.map((label) => ({ label, source: "common" as const, required: true as const })),
    ...(lineItem ? [{ label: lineItem, source: "line" as const, required: true as const }] : []),
  ];
  return {
    value,
    math: {
      inputs: { line },
      formula: "common items + the line-specific item, if the line has one",
      steps: { commonCount: COMMON_CHECKLIST_ITEMS.length, lineItem, total: value.length },
    },
  };
}

export interface Readiness {
  done: number;
  total: number;
  /** done ÷ total, or null when the checklist is empty. */
  ratio: number | null;
  label: string;
  readyToMarket: boolean;
}

/** Readiness = done ÷ total. "Ready to market" only at 100%. */
export function checklistReadiness(done: number, total: number): Calc<Readiness> {
  if (!Number.isInteger(done) || !Number.isInteger(total) || done < 0 || total < 0 || done > total) {
    throw new Error(`Expected 0 ≤ done ≤ total, received ${done} of ${total}`);
  }
  const ratio = total === 0 ? null : done / total;
  const readyToMarket = total > 0 && done === total;
  const label = total === 0 ? "No checklist items" : readyToMarket ? "Ready to market" : `${done} of ${total} ready`;
  return {
    value: { done, total, ratio, label, readyToMarket },
    math: {
      inputs: { done, total },
      formula: "readiness = done ÷ total; ready to market only when done = total (and total > 0)",
      steps: { ratio, readyToMarket, label },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

/** Overdue = due before the as-of date and not done. Due on the as-of date is not overdue. */
export function isTaskOverdue(asOf: ISODate, dueDate: ISODate, done: boolean): Calc<boolean> {
  const daysUntilDue = daysBetween(asOf, dueDate).value;
  const value = !done && daysUntilDue < 0;
  return {
    value,
    math: {
      inputs: { asOf, dueDate, done },
      formula: "overdue when not done and daysBetween(asOf, dueDate) < 0",
      steps: { daysUntilDue, overdue: value },
    },
  };
}

export const STANDARD_RENEWAL_TASKS = [
  { title: "Strategy meeting", daysBeforeExpiry: 120 },
  { title: "Submit to market", daysBeforeExpiry: 90 },
  { title: "Compare quotes", daysBeforeExpiry: 60 },
  { title: "Bind and issue", daysBeforeExpiry: 30 },
] as const;

export interface PlannedTask {
  title: string;
  dueDate: ISODate;
  daysBeforeExpiry: number;
}

export interface StandardTaskPlan {
  create: PlannedTask[];
  skippedPast: PlannedTask[];
  skippedExisting: PlannedTask[];
}

/**
 * The four standard renewal tasks, due 120/90/60/30 days before expiry.
 * Skips any whose due date is before the as-of date, and any whose title already
 * exists on the policy (case-insensitive), so pressing the button twice is safe.
 */
export function planStandardRenewalTasks(asOf: ISODate, expiryDate: ISODate, existingTitles: string[]): Calc<StandardTaskPlan> {
  const existing = new Set(existingTitles.map((t) => t.trim().toLowerCase()));
  const plan: StandardTaskPlan = { create: [], skippedPast: [], skippedExisting: [] };
  const perTask: { title: string; dueDate: ISODate; daysFromAsOf: number; decision: string }[] = [];
  for (const t of STANDARD_RENEWAL_TASKS) {
    const dueDate = addDays(expiryDate, -t.daysBeforeExpiry).value;
    const daysFromAsOf = daysBetween(asOf, dueDate).value;
    const task = { title: t.title, dueDate, daysBeforeExpiry: t.daysBeforeExpiry };
    let decision: string;
    if (daysFromAsOf < 0) {
      plan.skippedPast.push(task);
      decision = "skip: due before as-of date";
    } else if (existing.has(t.title.toLowerCase())) {
      plan.skippedExisting.push(task);
      decision = "skip: already exists";
    } else {
      plan.create.push(task);
      decision = "create";
    }
    perTask.push({ title: t.title, dueDate, daysFromAsOf, decision });
  }
  return {
    value: plan,
    math: {
      inputs: { asOf, expiryDate, existingTitles },
      formula: "due = expiry − N days for N in 120, 90, 60, 30; skip when due < asOf or the title already exists",
      steps: { perTask },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Outcomes                                                            */
/* ------------------------------------------------------------------ */

/** A renewed policy's successor runs from the old expiry for 12 months. */
export function planSuccessorTerm(expiringExpiryDate: ISODate): Calc<{ effectiveDate: ISODate; expiryDate: ISODate }> {
  const effectiveDate = expiringExpiryDate;
  const expiryDate = addMonths(expiringExpiryDate, 12).value;
  return {
    value: { effectiveDate, expiryDate },
    math: {
      inputs: { expiringExpiryDate },
      formula: "successor effective = old expiry; successor expiry = old expiry + 12 months",
      steps: { effectiveDate, expiryDate, termDays: daysBetween(effectiveDate, expiryDate).value },
    },
  };
}

/** Undo is refused when the successor has moved on (its own outcome or claims). */
export function checkUndoOutcome(input: { successorHasOutcome: boolean; successorClaimCount: number }): Calc<{ allowed: boolean; reason: string | null }> {
  let reason: string | null = null;
  if (input.successorHasOutcome) reason = "The renewal policy already has its own outcome. Undo that one first.";
  else if (input.successorClaimCount > 0) reason = "The renewal policy already has claims recorded against it.";
  return {
    value: { allowed: reason === null, reason },
    math: {
      inputs: input,
      formula: "allowed unless the successor has its own outcome or at least one claim",
      steps: { reason },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Rate change vs premium change                                       */
/* ------------------------------------------------------------------ */

export interface RateTerm {
  premium: number;
  exposureAmount: number | null;
  exposureBasis: ExposureBasis;
}

export interface RateBasisUnit {
  /** Exposure is divided by this before dividing premium by it. */
  divisor: number;
  label: string;
}

export function rateUnit(basis: ExposureBasis): RateBasisUnit {
  switch (basis) {
    case "revenue":
      return { divisor: 1000, label: "per $1,000 of revenue" };
    case "payroll":
      return { divisor: 1000, label: "per $1,000 of payroll" };
    case "square_feet":
      return { divisor: 100, label: "per 100 sq ft" };
    case "vehicles":
      return { divisor: 1, label: "per vehicle" };
    case "employees":
      return { divisor: 1, label: "per employee" };
    case "other":
      return { divisor: 1, label: "per unit of exposure" };
  }
}

export interface RateMetrics {
  unitLabel: string;
  expiringRate: number | null;
  renewalRate: number | null;
  premiumChange: number | null;
  exposureChange: number | null;
  rateChange: number | null;
  /** Why rate (and exposure) change could not be computed, or null. */
  rateUnavailable: string | null;
  identity: { lhs: number; rhs: number; difference: number; holds: boolean } | null;
  /** Non-null only when the identity check fails, which indicates a bug. */
  warning: string | null;
  sentence: string;
}

const IDENTITY_TOLERANCE = 0.0001;

function fmtNum(n: number, decimals: number): string {
  const [int, frac] = Math.abs(n).toFixed(decimals).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 ? "−" : ""}${grouped}${frac ? "." + frac : ""}`;
}
const f4 = (n: number) => fmtNum(n, 4);
const money = (n: number) => fmtNum(n, 2);

function describeMove(subject: string, change: number): string {
  const pct = Math.abs(change * 100).toFixed(1);
  if (pct === "0.0") return `${subject} was unchanged`;
  return `${subject} ${change > 0 ? "rose" : "fell"} ${pct}%`;
}

/**
 * Compares an expiring term with its renewal.
 *   rate = premium ÷ (exposure ÷ unit divisor)
 *   premiumChange = renewal premium ÷ expiring premium − 1
 *   exposureChange = renewal exposure ÷ expiring exposure − 1
 *   rateChange = renewal rate ÷ expiring rate − 1
 * and checks (1 + premiumChange) = (1 + rateChange) × (1 + exposureChange).
 */
export function getRateMetrics(expiring: RateTerm, renewal: RateTerm): Calc<RateMetrics> {
  for (const [side, t] of [["expiring", expiring], ["renewal", renewal]] as const) {
    if (!Number.isFinite(t.premium) || t.premium < 0) throw new Error(`Expected a non-negative ${side} premium, received ${t.premium}`);
    if (t.exposureAmount !== null && (!Number.isFinite(t.exposureAmount) || t.exposureAmount < 0)) {
      throw new Error(`Expected a non-negative ${side} exposure, received ${t.exposureAmount}`);
    }
  }

  const unit = rateUnit(expiring.exposureBasis);
  const lines: string[] = [];
  lines.push(`Expiring premium = ${money(expiring.premium)}`);
  lines.push(`Renewal premium = ${money(renewal.premium)}`);
  lines.push(`Expiring exposure = ${expiring.exposureAmount === null ? "missing" : money(expiring.exposureAmount)} (${expiring.exposureBasis})`);
  lines.push(`Renewal exposure = ${renewal.exposureAmount === null ? "missing" : money(renewal.exposureAmount)} (${renewal.exposureBasis})`);

  let premiumChange: number | null = null;
  if (expiring.premium > 0) {
    premiumChange = renewal.premium / expiring.premium - 1;
    lines.push(`Premium change = ${money(renewal.premium)} ÷ ${money(expiring.premium)} − 1 = ${f4(premiumChange)}`);
  } else {
    lines.push("Premium change cannot be computed: expiring premium is zero");
  }

  let rateUnavailable: string | null = null;
  if (expiring.exposureBasis !== renewal.exposureBasis) rateUnavailable = "exposure basis differs";
  else if (!expiring.exposureAmount || !renewal.exposureAmount) rateUnavailable = "exposure missing";

  let expiringRate: number | null = null;
  let renewalRate: number | null = null;
  let exposureChange: number | null = null;
  let rateChange: number | null = null;
  let identity: RateMetrics["identity"] = null;
  let warning: string | null = null;

  if (rateUnavailable === null) {
    const expExposure = expiring.exposureAmount as number;
    const renExposure = renewal.exposureAmount as number;
    const expUnits = expExposure / unit.divisor;
    const renUnits = renExposure / unit.divisor;
    expiringRate = expiring.premium / expUnits;
    renewalRate = renewal.premium / renUnits;
    lines.push(
      `Expiring rate = ${money(expiring.premium)} ÷ (${money(expExposure)} ÷ ${fmtNum(unit.divisor, 0)}) = ${money(expiring.premium)} ÷ ${f4(expUnits)} = ${f4(expiringRate)} ${unit.label}`,
    );
    lines.push(
      `Renewal rate = ${money(renewal.premium)} ÷ (${money(renExposure)} ÷ ${fmtNum(unit.divisor, 0)}) = ${money(renewal.premium)} ÷ ${f4(renUnits)} = ${f4(renewalRate)} ${unit.label}`,
    );
    exposureChange = renExposure / expExposure - 1;
    lines.push(`Exposure change = ${money(renExposure)} ÷ ${money(expExposure)} − 1 = ${f4(exposureChange)}`);
    if (expiringRate > 0) {
      rateChange = renewalRate / expiringRate - 1;
      lines.push(`Rate change = ${f4(renewalRate)} ÷ ${f4(expiringRate)} − 1 = ${f4(rateChange)}`);
    } else {
      rateUnavailable = "expiring rate is zero";
    }
    if (premiumChange !== null && rateChange !== null) {
      const lhs = 1 + premiumChange;
      const rhs = (1 + rateChange) * (1 + exposureChange);
      const difference = Math.abs(lhs - rhs);
      const holds = difference <= IDENTITY_TOLERANCE;
      identity = { lhs, rhs, difference, holds };
      lines.push(`Check: 1 + premium change = ${f4(lhs)}; (1 + rate change) × (1 + exposure change) = ${f4(1 + rateChange)} × ${f4(1 + exposureChange)} = ${f4(rhs)}`);
      if (!holds) {
        warning = `Internal check failed: (1 + premium change) differs from (1 + rate change) × (1 + exposure change) by ${difference.toFixed(6)}. This is a bug; please report it.`;
      }
    }
  } else {
    lines.push(`Rate change cannot be computed: ${rateUnavailable}`);
  }

  let sentence: string;
  if (premiumChange === null) {
    sentence = "Premium change is unavailable because the expiring premium is zero.";
  } else if (rateChange === null || exposureChange === null) {
    sentence = `${describeMove("Premium", premiumChange)}; rate change is unavailable (${rateUnavailable}).`;
  } else {
    sentence = `${describeMove("Premium", premiumChange)} while ${describeMove("exposure", exposureChange)}, so ${describeMove("the rate", rateChange)}.`;
  }

  return {
    value: {
      unitLabel: unit.label,
      expiringRate,
      renewalRate,
      premiumChange,
      exposureChange,
      rateChange,
      rateUnavailable,
      identity,
      warning,
      sentence,
    },
    math: {
      inputs: { expiring, renewal },
      formula:
        "rate = premium ÷ (exposure ÷ unit); premium change = renewal premium ÷ expiring premium − 1; exposure change = renewal exposure ÷ expiring exposure − 1; rate change = renewal rate ÷ expiring rate − 1",
      steps: { unitDivisor: unit.divisor, lines },
    },
  };
}
