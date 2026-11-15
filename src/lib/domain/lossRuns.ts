/**
 * Loss runs (v0.4). Pure: plain arrays of claims and policies plus the as-of
 * date in; { value, math } out. No React, no database, no clock.
 * `math.steps.lines` is the human-readable "Show the math".
 */
import { LINES_OF_BUSINESS, type ClaimStatus, type ExposureBasis, type LineOfBusiness } from "@/lib/constants";
import { daysBetween, isISODate } from "./dates";
import { parseCurrencyInput } from "./money";
import type { Calc, ISODate } from "./types";

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export interface LRPolicy {
  id: string;
  lineOfBusiness: LineOfBusiness;
  effectiveDate: ISODate;
  expiryDate: ISODate;
  annualPremium: number;
  exposureBasis: ExposureBasis;
  exposureAmount: number | null;
  previousPolicyId: string | null;
}

export interface LRClaim {
  id: string;
  lineOfBusiness: LineOfBusiness;
  claimNumber: string;
  dateOfLoss: ISODate;
  dateReported: ISODate;
  description: string | null;
  paid: number;
  reserved: number;
  status: ClaimStatus;
  policyId: string | null;
  /** v1.3: peril or coverage part ("All other perils" when absent) and the value at risk for percent-of-value deductibles. */
  peril?: string | null;
  valueAtRisk?: number | null;
}

export interface PolicyPeriod {
  policyId: string;
  /** Effective year, e.g. 2024. */
  year: number;
  /** "PY2024: 2024-01-10 to 2025-01-10" */
  label: string;
  effectiveDate: ISODate;
  expiryDate: ISODate;
  premium: number;
  exposureBasis: ExposureBasis;
  exposureAmount: number | null;
}

/* ------------------------------------------------------------------ */
/* Math-line formatting                                                */
/* ------------------------------------------------------------------ */

function group(n: number, decimals: number): string {
  const [int, frac] = Math.abs(n).toFixed(decimals).split(".");
  return `${n < 0 ? "−" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ? "." + frac : ""}`;
}
const usd = (n: number) => `$${group(n, 0)}`;
const usd2 = (n: number) => `$${group(n, 2)}`;
const r4 = (n: number) => group(n, 4);
const pct = (ratio: number) => `${group(ratio * 100, 1)}%`;
const sumMoney = (xs: number[]) => xs.reduce((c, x) => c + Math.round(x * 100), 0) / 100;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ------------------------------------------------------------------ */
/* Incurred                                                            */
/* ------------------------------------------------------------------ */

/** Incurred = paid + reserved. Computed, never stored. */
export function incurred(paid: number, reserved: number): Calc<number> {
  if (!Number.isFinite(paid) || paid < 0 || !Number.isFinite(reserved) || reserved < 0) {
    throw new Error(`Expected non-negative paid and reserved, received ${paid} and ${reserved}`);
  }
  const value = sumMoney([paid, reserved]);
  return {
    value,
    math: { inputs: { paid, reserved }, formula: "incurred = paid + reserved", steps: { lines: [`${usd2(paid)} + ${usd2(reserved)} = ${usd2(value)}`] } },
  };
}
const inc = (c: Pick<LRClaim, "paid" | "reserved">) => incurred(c.paid, c.reserved).value;

/* ------------------------------------------------------------------ */
/* Policy periods and policy-year assignment                           */
/* ------------------------------------------------------------------ */

/**
 * The account's policy periods in a line: every policy in that line, plus any
 * policy reached through previous_policy_id links from them, oldest first.
 */
export function policyPeriods(policies: LRPolicy[], line: LineOfBusiness): Calc<PolicyPeriod[]> {
  const byId = new Map(policies.map((p) => [p.id, p]));
  const chosen = new Map<string, LRPolicy>();
  for (const p of policies) {
    if (p.lineOfBusiness !== line) continue;
    let cur: LRPolicy | undefined = p;
    while (cur && !chosen.has(cur.id)) {
      chosen.set(cur.id, cur);
      cur = cur.previousPolicyId ? byId.get(cur.previousPolicyId) : undefined;
    }
  }
  const value = [...chosen.values()]
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.expiryDate.localeCompare(b.expiryDate))
    .map((p) => {
      const year = Number(p.effectiveDate.slice(0, 4));
      return {
        policyId: p.id,
        year,
        label: `PY${year}: ${p.effectiveDate} to ${p.expiryDate}`,
        effectiveDate: p.effectiveDate,
        expiryDate: p.expiryDate,
        premium: p.annualPremium,
        exposureBasis: p.exposureBasis,
        exposureAmount: p.exposureAmount,
      };
    });
  return {
    value,
    math: {
      inputs: { line, policies: policies.length },
      formula: "policies in the line, plus their previous_policy_id chain, ordered by effective date",
      steps: { lines: value.map((p) => p.label) },
    },
  };
}

/**
 * The policy period whose term contains the date of loss (effective ≤ loss < expiry).
 * When periods overlap, the claim's linked policy wins, otherwise the latest effective.
 * Null means "outside known policy periods".
 */
export function assignPolicyYear(claim: Pick<LRClaim, "dateOfLoss" | "policyId">, periods: PolicyPeriod[]): Calc<PolicyPeriod | null> {
  const containing = periods.filter((p) => p.effectiveDate <= claim.dateOfLoss && claim.dateOfLoss < p.expiryDate);
  const value = containing.find((p) => p.policyId === claim.policyId) ?? containing[containing.length - 1] ?? null;
  return {
    value,
    math: {
      inputs: { dateOfLoss: claim.dateOfLoss, periods: periods.length },
      formula: "the period with effective ≤ date of loss < expiry; linked policy first if several overlap",
      steps: { lines: [value ? `${claim.dateOfLoss} falls in ${value.label}` : `${claim.dateOfLoss} is outside known policy periods`], candidates: containing.length },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Data quality                                                        */
/* ------------------------------------------------------------------ */

export const CLAIM_FLAGS = ["outside_period", "duplicate_number", "closed_with_reserve", "reported_before_loss", "dated_after_as_of"] as const;
export type ClaimFlag = (typeof CLAIM_FLAGS)[number];
export const CLAIM_FLAG_LABELS: Record<ClaimFlag, string> = {
  outside_period: "Outside known policy periods",
  duplicate_number: "Duplicate claim number",
  closed_with_reserve: "Closed with a reserve",
  reported_before_loss: "Reported before the date of loss",
  dated_after_as_of: "Dated after the as-of date",
};

const normalizeNumber = (s: string) => s.trim().toLowerCase();

/** Flags per claim id. Every claim of the account is checked; periods are looked up per claim line. */
export function claimFlags(claims: LRClaim[], policies: LRPolicy[], asOf: ISODate): Calc<Record<string, ClaimFlag[]>> {
  const periodsByLine = new Map<LineOfBusiness, PolicyPeriod[]>();
  const periodsFor = (line: LineOfBusiness) => {
    if (!periodsByLine.has(line)) periodsByLine.set(line, policyPeriods(policies, line).value);
    return periodsByLine.get(line)!;
  };
  const numberCounts = new Map<string, number>();
  for (const c of claims) numberCounts.set(normalizeNumber(c.claimNumber), (numberCounts.get(normalizeNumber(c.claimNumber)) ?? 0) + 1);

  const value: Record<string, ClaimFlag[]> = {};
  const lines: string[] = [];
  for (const c of claims) {
    const flags: ClaimFlag[] = [];
    if (!assignPolicyYear(c, periodsFor(c.lineOfBusiness)).value) flags.push("outside_period");
    if ((numberCounts.get(normalizeNumber(c.claimNumber)) ?? 0) > 1) flags.push("duplicate_number");
    if (c.status === "closed" && c.reserved > 0) flags.push("closed_with_reserve");
    if (c.dateReported < c.dateOfLoss) flags.push("reported_before_loss");
    if (c.dateOfLoss > asOf || c.dateReported > asOf) flags.push("dated_after_as_of");
    value[c.id] = flags;
    if (flags.length) lines.push(`${c.claimNumber}: ${flags.map((f) => CLAIM_FLAG_LABELS[f]).join(", ")}`);
  }
  return {
    value,
    math: {
      inputs: { claims: claims.length, asOf },
      formula: "outside period: no term in the line contains the loss date; duplicate: claim number used more than once on the account; closed with reserve: closed and reserved > 0",
      steps: { lines: lines.length ? lines : ["No claims flagged"] },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Trend and development                                               */
/* ------------------------------------------------------------------ */

export const AGE_BUCKETS = ["12", "24", "36", "48", "60+"] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];
export type DevelopmentFactors = Record<AgeBucket, number>;
export const DEFAULT_FACTORS: DevelopmentFactors = { "12": 1, "24": 1, "36": 1, "48": 1, "60+": 1 };

/** Whole months from the policy year's effective date to the as-of date, bucketed down to 12/24/36/48/60+ (under 12 → 12). */
export function developmentAge(effectiveDate: ISODate, asOf: ISODate): Calc<{ months: number; bucket: AgeBucket }> {
  const [ey, em, ed] = effectiveDate.split("-").map(Number);
  const [ay, am, ad] = asOf.split("-").map(Number);
  let months = (ay - ey) * 12 + (am - em);
  if (ad < ed) months -= 1;
  months = Math.max(0, months);
  const bucket: AgeBucket = months >= 60 ? "60+" : months >= 48 ? "48" : months >= 36 ? "36" : months >= 24 ? "24" : "12";
  return {
    value: { months, bucket },
    math: {
      inputs: { effectiveDate, asOf },
      formula: "whole months elapsed, then bucket down to 12, 24, 36, 48 or 60+ (anything under 24 uses the 12 factor)",
      steps: { lines: [`${effectiveDate} to ${asOf} = ${months} whole months → age ${bucket}`] },
    },
  };
}

/** Trend factor = (1 + rate) ^ (prospective year − policy year). */
export function trendFactor(rate: number, policyYear: number, prospectiveYear: number): Calc<{ exponent: number; factor: number }> {
  if (!Number.isFinite(rate) || rate <= -1) throw new Error(`Expected a trend rate above −100%, received ${rate}`);
  const exponent = prospectiveYear - policyYear;
  const factor = Math.pow(1 + rate, exponent);
  return {
    value: { exponent, factor },
    math: {
      inputs: { rate, policyYear, prospectiveYear },
      formula: "factor = (1 + trend) ^ (prospective year − policy year)",
      steps: { lines: [`(1 + ${r4(rate)}) ^ (${prospectiveYear} − ${policyYear}) = ${r4(1 + rate)} ^ ${exponent} = ${r4(factor)}`] },
    },
  };
}

/** Adjusted incurred = incurred × trend factor × development factor, rounded to cents. */
export function adjustIncurred(amount: number, trend: number, development: number): Calc<number> {
  const value = round2(amount * trend * development);
  return {
    value,
    math: {
      inputs: { amount, trend, development },
      formula: "adjusted incurred = incurred × trend factor × development factor",
      steps: { lines: [`${usd2(amount)} × ${r4(trend)} × ${r4(development)} = ${usd2(value)}`] },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Policy-year summary                                                 */
/* ------------------------------------------------------------------ */

export interface Adjustments {
  /** Annual loss trend, e.g. 0.05; null when trend is off. */
  trendRate: number | null;
  /** Development factors by age; null when development is off. */
  factors: DevelopmentFactors | null;
}

export interface Frequency {
  value: number | null;
  /** e.g. "per $1M of revenue"; null when the basis has no frequency unit. */
  unit: string | null;
  reason: string | null;
}

export interface SummaryRow {
  label: string;
  year: number;
  period: PolicyPeriod;
  current: boolean;
  claimCount: number;
  openCount: number;
  paid: number;
  reserved: number;
  incurred: number;
  earnedPremium: number;
  /** True for the running year: premium pro-rated by days elapsed to the as-of date. */
  earnedToDate: boolean;
  lossRatio: number | null;
  frequency: Frequency;
  severity: number | null;
  trendExponent: number | null;
  trendFactor: number;
  ageMonths: number;
  ageBucket: AgeBucket;
  developmentFactor: number;
  adjustedIncurred: number;
  adjustedLossRatio: number | null;
}

export interface SummaryTotal {
  label: string;
  years: number;
  claimCount: number;
  openCount: number;
  paid: number;
  reserved: number;
  incurred: number;
  earnedPremium: number;
  lossRatio: number | null;
  frequency: Frequency;
  severity: number | null;
  adjustedIncurred: number;
  adjustedLossRatio: number | null;
}

export interface PolicyYearSummary {
  rows: SummaryRow[];
  total: SummaryTotal | null;
  average: SummaryTotal | null;
  prospectiveYear: number | null;
  adjusted: boolean;
  /** Claims in the line no period contains: excluded until fixed. */
  excludedOutsidePeriod: number;
}

function frequencyUnit(basis: ExposureBasis): { divisor: number; unit: string } | null {
  switch (basis) {
    case "revenue":
      return { divisor: 1_000_000, unit: "per $1M of revenue" };
    case "payroll":
      return { divisor: 1_000_000, unit: "per $1M of payroll" };
    case "employees":
      return { divisor: 100, unit: "per 100 employees" };
    case "vehicles":
      return { divisor: 100, unit: "per 100 vehicles" };
    default:
      return null;
  }
}

/**
 * Per account and line: the current policy year plus up to five before it.
 * Totals and averages cover the five most recent years (the current one included).
 *   loss ratio = incurred ÷ earned premium
 *   frequency = claims ÷ exposure units ($1M of revenue/payroll, 100 employees/vehicles)
 *   severity = incurred ÷ claim count
 * The running year's earned premium (and exposure) is pro-rated by days elapsed to the as-of date.
 */
export function policyYearSummary(input: {
  claims: LRClaim[];
  policies: LRPolicy[];
  line: LineOfBusiness;
  asOf: ISODate;
  adjustments: Adjustments;
}): Calc<PolicyYearSummary> {
  const { asOf, line, adjustments } = input;
  const periods = policyPeriods(input.policies, line).value.filter((p) => p.effectiveDate <= asOf);
  const shown = periods.slice(-6);
  const lineClaims = input.claims.filter((c) => c.lineOfBusiness === line);
  const assigned = lineClaims.map((c) => ({ claim: c, period: assignPolicyYear(c, periods).value }));
  const excludedOutsidePeriod = assigned.filter((a) => a.period === null).length;
  const current = shown.find((p) => p.effectiveDate <= asOf && asOf < p.expiryDate) ?? null;
  const latest = shown[shown.length - 1];
  const prospectiveYear = current ? Number(current.expiryDate.slice(0, 4)) : latest ? Number(latest.expiryDate.slice(0, 4)) : null;
  const adjusted = adjustments.trendRate !== null || adjustments.factors !== null;
  const lines: string[] = [];

  const rows: SummaryRow[] = shown.map((period) => {
    const claims = assigned.filter((a) => a.period?.policyId === period.policyId).map((a) => a.claim);
    const paid = sumMoney(claims.map((c) => c.paid));
    const reserved = sumMoney(claims.map((c) => c.reserved));
    const incurredTotal = sumMoney(claims.map(inc));
    const isCurrent = current?.policyId === period.policyId;
    const term = daysBetween(period.effectiveDate, period.expiryDate).value;
    const elapsed = isCurrent ? daysBetween(period.effectiveDate, asOf).value : term;
    const fraction = term > 0 ? elapsed / term : 0;
    const earnedPremium = round2(period.premium * fraction);
    const unit = frequencyUnit(period.exposureBasis);
    let frequency: Frequency;
    if (!unit) frequency = { value: null, unit: null, reason: `no frequency unit for a ${period.exposureBasis.replace("_", " ")} basis` };
    else if (!period.exposureAmount) frequency = { value: null, unit: unit.unit, reason: "exposure missing" };
    else frequency = { value: claims.length / ((period.exposureAmount / unit.divisor) * fraction), unit: unit.unit, reason: null };
    const tf = adjustments.trendRate !== null && prospectiveYear !== null ? trendFactor(adjustments.trendRate, period.year, prospectiveYear).value : null;
    const age = developmentAge(period.effectiveDate, asOf).value;
    const ldf = adjustments.factors ? adjustments.factors[age.bucket] : 1;
    const adjustedIncurred = adjustIncurred(incurredTotal, tf?.factor ?? 1, ldf).value;
    const row: SummaryRow = {
      label: `PY${period.year}`,
      year: period.year,
      period,
      current: isCurrent,
      claimCount: claims.length,
      openCount: claims.filter((c) => c.status === "open").length,
      paid,
      reserved,
      incurred: incurredTotal,
      earnedPremium,
      earnedToDate: isCurrent,
      lossRatio: earnedPremium > 0 ? incurredTotal / earnedPremium : null,
      frequency,
      severity: claims.length > 0 ? incurredTotal / claims.length : null,
      trendExponent: tf ? tf.exponent : null,
      trendFactor: tf?.factor ?? 1,
      ageMonths: age.months,
      ageBucket: age.bucket,
      developmentFactor: ldf,
      adjustedIncurred,
      adjustedLossRatio: earnedPremium > 0 ? adjustedIncurred / earnedPremium : null,
    };
    lines.push(
      `${period.label}: ${claims.length} claims, incurred ${usd(incurredTotal)}; earned ${isCurrent ? `${usd(period.premium)} × ${elapsed}/${term} days = ${usd2(earnedPremium)} (to date)` : usd(earnedPremium)}; ` +
        `loss ratio ${row.lossRatio === null ? "—" : `${usd(incurredTotal)} ÷ ${usd2(earnedPremium)} = ${r4(row.lossRatio)}`}; ` +
        `frequency ${frequency.value === null ? `— (${frequency.reason})` : `${claims.length} ÷ ${r4((period.exposureAmount! / unit!.divisor) * fraction)} = ${r4(frequency.value)} ${frequency.unit}`}; ` +
        `severity ${row.severity === null ? "—" : `${usd(incurredTotal)} ÷ ${claims.length} = ${usd2(row.severity)}`}` +
        (adjusted
          ? `; adjusted ${usd2(incurredTotal)} × trend ${r4(row.trendFactor)}${tf ? ` (exponent ${tf.exponent})` : ""} × development ${r4(ldf)} (age ${age.months} months → ${age.bucket}) = ${usd2(adjustedIncurred)}`
          : ""),
    );
    return row;
  });

  const five = rows.slice(-5);
  let total: SummaryTotal | null = null;
  let average: SummaryTotal | null = null;
  if (five.length > 0) {
    const n = five.length;
    const claimCount = five.reduce((s, r) => s + r.claimCount, 0);
    const incurredSum = sumMoney(five.map((r) => r.incurred));
    const earned = sumMoney(five.map((r) => r.earnedPremium));
    const adjustedSum = sumMoney(five.map((r) => r.adjustedIncurred));
    const units = five.map((r) => {
      const u = frequencyUnit(r.period.exposureBasis);
      if (!u || !r.period.exposureAmount) return null;
      const term = daysBetween(r.period.effectiveDate, r.period.expiryDate).value;
      const elapsed = r.current ? daysBetween(r.period.effectiveDate, asOf).value : term;
      return { unit: u.unit, units: (r.period.exposureAmount / u.divisor) * (elapsed / term) };
    });
    const sameUnit = units.every((u) => u && u.unit === units[0]?.unit);
    const unitSum = sameUnit ? units.reduce((s, u) => s + (u?.units ?? 0), 0) : 0;
    const frequency: Frequency =
      sameUnit && unitSum > 0
        ? { value: claimCount / unitSum, unit: units[0]!.unit, reason: null }
        : { value: null, unit: null, reason: "exposure bases differ or are missing across the years" };
    const range = `PY${five[0].year}–PY${five[n - 1].year}`;
    total = {
      label: `${n}-year total (${range})`,
      years: n,
      claimCount,
      openCount: five.reduce((s, r) => s + r.openCount, 0),
      paid: sumMoney(five.map((r) => r.paid)),
      reserved: sumMoney(five.map((r) => r.reserved)),
      incurred: incurredSum,
      earnedPremium: earned,
      lossRatio: earned > 0 ? incurredSum / earned : null,
      frequency,
      severity: claimCount > 0 ? incurredSum / claimCount : null,
      adjustedIncurred: adjustedSum,
      adjustedLossRatio: earned > 0 ? adjustedSum / earned : null,
    };
    average = {
      ...total,
      label: `${n}-year average per year`,
      claimCount: claimCount / n,
      openCount: total.openCount / n,
      paid: round2(total.paid / n),
      reserved: round2(total.reserved / n),
      incurred: round2(incurredSum / n),
      earnedPremium: round2(earned / n),
      adjustedIncurred: round2(adjustedSum / n),
    };
    lines.push(
      `${total.label}: ${claimCount} claims, incurred ${usd(incurredSum)}, earned ${usd2(earned)}; loss ratio ${total.lossRatio === null ? "—" : r4(total.lossRatio)}; severity ${total.severity === null ? "—" : usd2(total.severity)}`,
      `Average per year = total ÷ ${n}; loss ratio, frequency and severity on the average row are the ${n}-year aggregates, not averages of yearly ratios`,
    );
  }
  if (excludedOutsidePeriod > 0) lines.push(`${excludedOutsidePeriod} claim(s) outside known policy periods are excluded until fixed`);

  return {
    value: { rows, total, average, prospectiveYear, adjusted, excludedOutsidePeriod },
    math: {
      inputs: { line, asOf, adjustments },
      formula:
        "loss ratio = incurred ÷ earned premium; frequency = claims ÷ exposure units; severity = incurred ÷ claims; the running year is earned to date",
      steps: { lines },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Large losses and open claims                                        */
/* ------------------------------------------------------------------ */

export interface LargeLossRow {
  claim: LRClaim;
  incurred: number;
  share: number;
}

export interface LargeLosses {
  threshold: number;
  cap: number;
  rows: LargeLossRow[];
  totalIncurred: number;
  largeIncurred: number;
  cappedIncurred: number;
  earnedPremium: number;
  lossRatio: number | null;
  cappedLossRatio: number | null;
}

/**
 * Claims at or above the threshold with their share of total incurred, and the
 * capped loss ratio: Σ min(incurred, cap) ÷ earned premium.
 */
export function largeLosses(claims: LRClaim[], earnedPremium: number, threshold: number, cap: number): Calc<LargeLosses> {
  const amounts = claims.map(inc);
  const totalIncurred = sumMoney(amounts);
  const rows = claims
    .map((c, i) => ({ claim: c, incurred: amounts[i], share: totalIncurred > 0 ? amounts[i] / totalIncurred : 0 }))
    .filter((r) => r.incurred >= threshold)
    .sort((a, b) => b.incurred - a.incurred);
  const cappedIncurred = sumMoney(amounts.map((a) => Math.min(a, cap)));
  const largeIncurred = sumMoney(rows.map((r) => r.incurred));
  const lossRatio = earnedPremium > 0 ? totalIncurred / earnedPremium : null;
  const cappedLossRatio = earnedPremium > 0 ? cappedIncurred / earnedPremium : null;
  return {
    value: { threshold, cap, rows, totalIncurred, largeIncurred, cappedIncurred, earnedPremium, lossRatio, cappedLossRatio },
    math: {
      inputs: { claims: claims.length, earnedPremium, threshold, cap },
      formula: "large = incurred ≥ threshold; share = incurred ÷ total incurred; capped incurred = Σ min(incurred, cap)",
      steps: {
        lines: [
          ...rows.map((r) => `${r.claim.claimNumber}: ${usd(r.incurred)} ÷ ${usd(totalIncurred)} = ${pct(r.share)}`),
          `Capped incurred = ${amounts.map((a) => `min(${usd(a)}, ${usd(cap)})`).join(" + ") || "$0"} = ${usd(cappedIncurred)}`,
          lossRatio === null ? "Loss ratio: no earned premium" : `Full loss ratio = ${usd(totalIncurred)} ÷ ${usd2(earnedPremium)} = ${r4(lossRatio)}`,
          cappedLossRatio === null ? "Capped loss ratio: no earned premium" : `Capped loss ratio = ${usd(cappedIncurred)} ÷ ${usd2(earnedPremium)} = ${r4(cappedLossRatio)}`,
        ],
      },
    },
  };
}

export interface OpenClaims {
  rows: LRClaim[];
  totalOpenReserves: number;
  totalIncurred: number;
  /** Open reserves ÷ total incurred; null when nothing is incurred. */
  reservedShare: number | null;
}

/** Open claims, largest reserve first, with total open reserves and their share of total incurred. */
export function openClaims(claims: LRClaim[]): Calc<OpenClaims> {
  const rows = claims.filter((c) => c.status === "open").sort((a, b) => b.reserved - a.reserved || a.claimNumber.localeCompare(b.claimNumber));
  const totalOpenReserves = sumMoney(rows.map((c) => c.reserved));
  const totalIncurred = sumMoney(claims.map(inc));
  const reservedShare = totalIncurred > 0 ? totalOpenReserves / totalIncurred : null;
  return {
    value: { rows, totalOpenReserves, totalIncurred, reservedShare },
    math: {
      inputs: { claims: claims.length },
      formula: "open reserves = Σ reserved on open claims; share = open reserves ÷ total incurred",
      steps: {
        lines: [
          `Open reserves = ${rows.map((c) => usd(c.reserved)).join(" + ") || "$0"} = ${usd(totalOpenReserves)}`,
          reservedShare === null ? "Share: nothing incurred" : `Share = ${usd(totalOpenReserves)} ÷ ${usd(totalIncurred)} = ${pct(reservedShare)}`,
        ],
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* CSV import validation                                               */
/* ------------------------------------------------------------------ */

export const IMPORT_COLUMNS = ["claim_number", "line", "date_of_loss", "date_reported", "description", "paid", "reserved", "status"] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
/** v1.3: optional columns the import also understands. */
export const IMPORT_OPTIONAL_COLUMNS = ["peril", "value_at_risk"] as const;

/** Which required columns are missing and which extra ones were found (headers compared case-insensitively). */
export function checkImportColumns(headers: string[]): Calc<{ missing: ImportColumn[]; extra: string[] }> {
  const seen = new Set(headers.map((h) => h.trim().toLowerCase()));
  const missing = IMPORT_COLUMNS.filter((c) => !seen.has(c));
  const known = [...IMPORT_COLUMNS, ...IMPORT_OPTIONAL_COLUMNS] as readonly string[];
  const extra = headers.filter((h) => !known.includes(h.trim().toLowerCase()));
  return {
    value: { missing, extra },
    math: { inputs: { headers }, formula: "every template column must be present, in any order; peril and value_at_risk are optional", steps: { lines: [missing.length ? `Missing: ${missing.join(", ")}` : "All columns present"] } },
  };
}

const LINE_ALIASES: Record<string, LineOfBusiness> = {
  gl: "General Liability",
  cgl: "General Liability",
  auto: "Commercial Auto",
  umbrella: "Umbrella/Excess",
  excess: "Umbrella/Excess",
  "e&o": "Professional Liability",
  eb: "Equipment Breakdown",
};

export function matchLine(raw: string): LineOfBusiness | null {
  const s = raw.trim().toLowerCase();
  return LINES_OF_BUSINESS.find((l) => l.toLowerCase() === s) ?? LINE_ALIASES[s] ?? null;
}

export interface ParsedImportClaim {
  claimNumber: string;
  lineOfBusiness: LineOfBusiness;
  dateOfLoss: ISODate;
  dateReported: ISODate;
  description: string | null;
  paid: number;
  reserved: number;
  status: ClaimStatus;
  peril: string | null;
  valueAtRisk: number | null;
}

export interface ImportRowResult {
  /** 1-based data row number (the header is row 0). */
  row: number;
  raw: Record<string, string>;
  valid: boolean;
  reasons: string[];
  warnings: string[];
  parsed: ParsedImportClaim | null;
}

/**
 * Validates parsed CSV rows. Invalid: missing or malformed date, date after the
 * as-of date, reported before loss, unknown line, missing or non-numeric or
 * negative amount, unknown status, duplicate claim number (against the account
 * or an earlier row). Warning: closed with a reserve.
 */
export function validateImportRows(rows: Record<string, string>[], ctx: { asOf: ISODate; existingClaimNumbers: string[] }): Calc<ImportRowResult[]> {
  const seen = new Set(ctx.existingClaimNumbers.map(normalizeNumber));
  const results: ImportRowResult[] = rows.map((rawIn, i) => {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawIn)) raw[k.trim().toLowerCase()] = (v ?? "").toString().trim();
    const reasons: string[] = [];
    const warnings: string[] = [];

    const claimNumber = raw.claim_number ?? "";
    if (!claimNumber) reasons.push("missing claim number");

    const line = matchLine(raw.line ?? "");
    if (!raw.line) reasons.push("missing line");
    else if (!line) reasons.push(`unknown line "${raw.line}"`);

    const date = (key: "date_of_loss" | "date_reported", label: string): ISODate | null => {
      const v = (raw[key] ?? "").replace(/\//g, "-");
      if (!v) {
        reasons.push(`missing ${label}`);
        return null;
      }
      if (!isISODate(v)) {
        reasons.push(`invalid ${label} "${raw[key]}" (use YYYY-MM-DD)`);
        return null;
      }
      if (v > ctx.asOf) reasons.push(`future ${label} (after the as-of date ${ctx.asOf})`);
      return v;
    };
    const dateOfLoss = date("date_of_loss", "date of loss");
    const dateReported = date("date_reported", "date reported");
    if (dateOfLoss && dateReported && dateReported < dateOfLoss) reasons.push("reported before the date of loss");

    const amount = (key: "paid" | "reserved"): number | null => {
      const v = raw[key] ?? "";
      if (!v) {
        reasons.push(`missing ${key} amount`);
        return null;
      }
      const p = parseCurrencyInput(v);
      if (p.value === null) {
        reasons.push(p.error === "Amount cannot be negative" ? `negative ${key} amount` : `non-numeric ${key} amount "${v}"`);
        return null;
      }
      return p.value;
    };
    const paid = amount("paid");
    const reserved = amount("reserved");

    const statusRaw = (raw.status ?? "").toLowerCase();
    const status: ClaimStatus | null = statusRaw === "open" || statusRaw === "closed" ? statusRaw : null;
    if (!statusRaw) reasons.push("missing status");
    else if (!status) reasons.push(`unknown status "${raw.status}" (use open or closed)`);

    if (claimNumber) {
      if (seen.has(normalizeNumber(claimNumber))) reasons.push("duplicate claim number");
      else seen.add(normalizeNumber(claimNumber));
    }
    if (status === "closed" && reserved !== null && reserved > 0) warnings.push("closed with a reserve");
    let valueAtRisk: number | null = null;
    if (raw.value_at_risk) {
      const v = parseCurrencyInput(raw.value_at_risk);
      if (v.value === null) reasons.push(v.error === "Amount cannot be negative" ? "negative value at risk" : `non-numeric value at risk "${raw.value_at_risk}"`);
      else valueAtRisk = v.value;
    }

    const valid = reasons.length === 0;
    return {
      row: i + 1,
      raw,
      valid,
      reasons,
      warnings,
      parsed: valid
        ? {
            claimNumber,
            lineOfBusiness: line!,
            dateOfLoss: dateOfLoss!,
            dateReported: dateReported!,
            description: raw.description ? raw.description : null,
            paid: paid!,
            reserved: reserved!,
            status: status!,
            peril: raw.peril ? raw.peril : null,
            valueAtRisk,
          }
        : null,
    };
  });
  const validCount = results.filter((r) => r.valid).length;
  return {
    value: results,
    math: {
      inputs: { rows: rows.length, asOf: ctx.asOf },
      formula: "a row is valid only with every required field present and well-formed, no future dates, and a claim number not already used",
      steps: { lines: [`${validCount} of ${rows.length} rows valid`, ...results.filter((r) => !r.valid).map((r) => `Row ${r.row}: ${r.reasons.join("; ")}`)] },
    },
  };
}
