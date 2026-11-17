/**
 * Strategy (v1.2): retention optimizer, total cost of risk, considerations and
 * the report's assumptions. Pure: claims, policies, options and settings in;
 * { value, math } out. No React, no database, no clock.
 *
 * The optimizer applies each option's deductible (and aggregate cap) to the
 * account's actual claims, year by year. It does not fit a loss distribution or
 * weight the account's own experience against an industry expectation; the
 * Assumptions section says so.
 */
import type { ClaimStatus, LineOfBusiness } from "@/lib/constants";
import { DEFAULT_PERIL, deductibleForClaim, describeRule, flatRule, matchRule, retainedAboveLimit, type DeductibleRule } from "./deductibles";
import { coverageProfile, layerSummary, towerLabels, type ProgramLayerInput } from "./program";
import { getRateMetrics, type RateTerm } from "./renewals";
import {
  assignPolicyYear,
  developmentAge,
  incurred,
  policyPeriods,
  trendFactor,
  type AgeBucket,
  type Adjustments,
  type LRClaim,
  type LRPolicy,
  type PolicyPeriod,
} from "./lossRuns";
import type { Calc, ISODate } from "./types";

/* ------------------------------------------------------------------ */
/* Formatting for math lines                                           */
/* ------------------------------------------------------------------ */

function group(n: number, decimals: number): string {
  const [int, frac] = Math.abs(n).toFixed(decimals).split(".");
  return `${n < 0 ? "−" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ? "." + frac : ""}`;
}
const usd = (n: number) => `$${group(n, 0)}`;
const usd2 = (n: number) => `$${group(n, 2)}`;
const r4 = (n: number) => group(n, 4);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const sumMoney = (xs: number[]) => xs.reduce((c, x) => c + Math.round(x * 100), 0) / 100;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "12 Nov 2026" from "2026-11-12" for sentences; the ISO string is kept where a date is data. */
const longDate = (iso: ISODate) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
};

/* ------------------------------------------------------------------ */
/* Claims grouped by policy year                                       */
/* ------------------------------------------------------------------ */

export interface YearClaim {
  id: string;
  claimNumber: string;
  status: ClaimStatus;
  paid: number;
  reserved: number;
  /** paid + reserved, unadjusted. */
  incurred: number;
  /** Peril or coverage part; "All other perils" unless the claim says otherwise (v1.3). */
  peril: string;
  valueAtRisk: number | null;
}

export interface ClaimsYear {
  period: PolicyPeriod;
  /** "PY2023" */
  label: string;
  year: number;
  /** The running year: effective ≤ as-of < expiry. Its claims are incomplete. */
  current: boolean;
  ageMonths: number;
  ageBucket: AgeBucket;
  claims: YearClaim[];
  incurred: number;
  openCount: number;
  openReserved: number;
}

export interface ClaimsByPolicyYear {
  line: LineOfBusiness;
  asOf: ISODate;
  /** Every policy year that has started by the as-of date, oldest first. */
  years: ClaimsYear[];
  /** The year the current term expires (what trend restates to); null without a period. */
  prospectiveYear: number | null;
  /** Claims in the line that no period contains; excluded. */
  excludedOutsidePeriod: number;
}

/** Claims in the line by the policy period containing their date of loss, with each year's development age. */
export function groupClaimsByPolicyYear(claims: LRClaim[], policies: LRPolicy[], line: LineOfBusiness, asOf: ISODate): Calc<ClaimsByPolicyYear> {
  const periods = policyPeriods(policies, line).value.filter((p) => p.effectiveDate <= asOf);
  const lineClaims = claims.filter((c) => c.lineOfBusiness === line);
  const assigned = lineClaims.map((c) => ({ claim: c, period: assignPolicyYear(c, periods).value }));
  const excludedOutsidePeriod = assigned.filter((a) => a.period === null).length;
  const current = periods.find((p) => p.effectiveDate <= asOf && asOf < p.expiryDate) ?? null;
  const latest = periods[periods.length - 1];
  const prospectiveYear = current ? Number(current.expiryDate.slice(0, 4)) : latest ? Number(latest.expiryDate.slice(0, 4)) : null;
  const lines: string[] = [];
  const years: ClaimsYear[] = periods.map((period) => {
    const rows = assigned
      .filter((a) => a.period?.policyId === period.policyId)
      .map(({ claim }) => ({ id: claim.id, claimNumber: claim.claimNumber, status: claim.status, paid: claim.paid, reserved: claim.reserved, incurred: incurred(claim.paid, claim.reserved).value, peril: claim.peril?.trim() || DEFAULT_PERIL, valueAtRisk: claim.valueAtRisk ?? null }));
    const age = developmentAge(period.effectiveDate, asOf).value;
    const open = rows.filter((r) => r.status === "open");
    const total = sumMoney(rows.map((r) => r.incurred));
    const isCurrent = current?.policyId === period.policyId;
    lines.push(`${period.label}${isCurrent ? " (current year, incomplete)" : ""}: ${rows.length} claims, incurred ${rows.map((r) => usd(r.incurred)).join(" + ") || "$0"} = ${usd(total)}; age ${age.months} months → ${age.bucket}`);
    return {
      period,
      label: `PY${period.year}`,
      year: period.year,
      current: isCurrent,
      ageMonths: age.months,
      ageBucket: age.bucket,
      claims: rows,
      incurred: total,
      openCount: open.length,
      openReserved: sumMoney(open.map((r) => r.reserved)),
    };
  });
  if (excludedOutsidePeriod > 0) lines.push(`${excludedOutsidePeriod} claim(s) outside known policy periods are excluded`);
  return {
    value: { line, asOf, years, prospectiveYear, excludedOutsidePeriod },
    math: {
      inputs: { line, asOf, claims: lineClaims.length, periods: periods.length },
      formula: "each claim belongs to the policy period with effective ≤ date of loss < expiry; incurred = paid + reserved",
      steps: { lines },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Retention options and the replay                                    */
/* ------------------------------------------------------------------ */

export interface RetentionOption {
  id: string;
  label: string;
  carrier: string;
  deductible: number;
  /** Most the client retains in a year under this option; null = no cap. */
  aggregateCap: number | null;
  premium: number;
}

export interface ReplaySettings {
  /** Policy years to use, most recent first (default 5). */
  yearsToUse: number;
  /** Whether the current (incomplete) year counts as one of them (default true). */
  includeCurrentYear: boolean;
  /** Trend and development from the Loss runs tab (default both off). */
  adjustments: Adjustments;
  /**
   * The policy's deductible schedule (v1.3). A claim whose peril matches a rule
   * uses that rule; every other claim uses the option's deductible, which stands
   * in for the default (all other perils) rule. Empty or absent = one flat deductible.
   */
  schedule?: DeductibleRule[];
  /**
   * v1.5.1: the policy's headline per-occurrence limit. Losses above a coverage
   * part's occurrence limit (the part's own sublimit, else this headline limit)
   * are retained by the client on top of the deductible.
   */
  defaultOccurrenceLimit?: number | null;
}

export const DEFAULT_REPLAY_SETTINGS: ReplaySettings = { yearsToUse: 5, includeCurrentYear: true, adjustments: { trendRate: null, factors: null } };

/** A deductible set for one option: the option's amount for the default part, the schedule's other parts, and the headline occurrence limit (v1.5.1). */
export interface ReplayDeductible {
  defaultAmount: number;
  rules: DeductibleRule[];
  defaultOccurrenceLimit?: number | null;
}

export interface ReplayClaim extends YearClaim {
  trendFactor: number;
  developmentFactor: number;
  /** incurred × trend × development; equals incurred when both are off. */
  adjustedIncurred: number;
}

/** A policy year as the replay sees it: claims on the chosen basis. */
export interface ReplayYear {
  label: string;
  year: number;
  current: boolean;
  period: PolicyPeriod;
  ageBucket: AgeBucket;
  claims: ReplayClaim[];
  /** Σ adjusted incurred. */
  incurred: number;
  openCount: number;
  openReserved: number;
}

export interface YearReplay {
  label: string;
  year: number;
  current: boolean;
  claimCount: number;
  incurred: number;
  /** Σ min(incurred, deductible) before the cap. */
  retainedBeforeCap: number;
  /** After min(·, aggregate cap). */
  retained: number;
  capApplied: boolean;
  /** v1.5.1: Σ max(0, incurred − the claim's coverage-part occurrence limit); the same for every option, retained on top of the deductible. */
  retainedAboveLimit: number;
  /** incurred − retained − retained above limit: what the insurer pays. */
  transferred: number;
  /** Claims left out of the dollar replay (waiting-period rules, or a percent-of-value rule with no value at risk and no minimum). */
  excludedClaims: { claimNumber: string; reason: string }[];
  /** Claims whose deductible came from a schedule rule rather than the option's deductible. */
  scheduledClaims: number;
}

export interface WorstYearTest {
  label: string;
  optionRetained: number;
  baseRetained: number;
  additionalRetained: number;
  premiumSaving: number;
  /** additional retained − premium saving; positive means the option cost more than the base that year. */
  costVersusBase: number;
  sentence: string;
}

export interface MaxExposure {
  value: number;
  /** "deductible × claims" or "aggregate cap". */
  basis: "deductible × claims" | "aggregate cap";
  /** Most claims in any replayed year, and which year. */
  claimCount: number;
  claimYear: string | null;
}

export interface OptionAnalysis {
  option: RetentionOption;
  isBase: boolean;
  years: YearReplay[];
  averageRetained: number;
  averageTransferred: number;
  worstYear: { label: string; retained: number; claimCount: number } | null;
  /** v1.5.1: average per year of retained above limit (identical across options). */
  averageRetainedAboveLimit: number;
  /** premium + average retained + average retained above limit (v1.5.1; the last term is zero unless a claim exceeds a part's limit). */
  expectedTotalCost: number;
  /** premium + worst-year retained. */
  worstYearTotalCost: number;
  /** base premium − option premium (0 for the base). */
  premiumSaving: number;
  /** option average retained − base average retained (0 for the base). */
  additionalRetained: number;
  /** premium saving − additional retained. */
  netSaving: number;
  /** = premium saving: the most extra retained loss the client can absorb in a year before the option costs more than the base. */
  breakEvenRetained: number;
  worstYearTest: WorstYearTest | null;
  maxAnnualExposure: MaxExposure;
}

export interface RetentionAnalysis {
  years: ReplayYear[];
  /** Years that exist but were left out (the running year when excluded, or older than yearsToUse). */
  omittedYears: { label: string; reason: string }[];
  baseOptionId: string | null;
  options: OptionAnalysis[];
  adjusted: boolean;
  prospectiveYear: number | null;
  basisLabel: string;
  /** v1.5.1: true when any year used has a loss above a coverage part's occurrence limit. */
  anyAboveLimit: boolean;
}

/** Picks the policy years to use and restates each claim on the chosen basis. */
export function selectReplayYears(grouped: ClaimsByPolicyYear, settings: ReplaySettings): Calc<{ years: ReplayYear[]; omitted: { label: string; reason: string }[] }> {
  const { adjustments } = settings;
  const omitted: { label: string; reason: string }[] = [];
  let pool = grouped.years;
  const current = pool.find((y) => y.current);
  if (current && !settings.includeCurrentYear) {
    pool = pool.filter((y) => !y.current);
    omitted.push({ label: current.label, reason: "current year excluded by the settings" });
  }
  const n = Math.max(0, Math.floor(settings.yearsToUse));
  const dropped = pool.slice(0, Math.max(0, pool.length - n));
  for (const y of dropped) omitted.push({ label: y.label, reason: `older than the ${n} most recent years` });
  const chosen = pool.slice(-n);
  const lines: string[] = [];
  const years: ReplayYear[] = chosen.map((y) => {
    const tf = adjustments.trendRate !== null && grouped.prospectiveYear !== null ? trendFactor(adjustments.trendRate, y.year, grouped.prospectiveYear).value.factor : 1;
    const df = adjustments.factors ? adjustments.factors[y.ageBucket] : 1;
    const claims: ReplayClaim[] = y.claims.map((c) => ({ ...c, trendFactor: tf, developmentFactor: df, adjustedIncurred: round2(c.incurred * tf * df) }));
    const total = sumMoney(claims.map((c) => c.adjustedIncurred));
    lines.push(
      `${y.label}${y.current ? " (current year, incomplete)" : ""}: ${claims.length} claims` +
        (tf !== 1 || df !== 1 ? `, each × trend ${r4(tf)} × development ${r4(df)} (age ${y.ageBucket})` : "") +
        ` → ${claims.map((c) => usd(c.adjustedIncurred)).join(" + ") || "$0"} = ${usd(total)}`,
    );
    return { label: y.label, year: y.year, current: y.current, period: y.period, ageBucket: y.ageBucket, claims, incurred: total, openCount: y.openCount, openReserved: y.openReserved };
  });
  for (const o of omitted) lines.push(`${o.label} omitted: ${o.reason}`);
  return {
    value: { years, omitted },
    math: {
      inputs: { yearsToUse: settings.yearsToUse, includeCurrentYear: settings.includeCurrentYear, adjustments, available: grouped.years.map((y) => y.label) },
      formula: "the most recent N policy years (current year optional); adjusted incurred = incurred × trend factor × development factor",
      steps: { lines },
    },
  };
}

/**
 * One option against one year: Σ min(incurred, deductible), then min(·, cap).
 * With a coverage schedule, each claim's deductible comes from the part for its
 * peril; claims with no dollar deductible are excluded and flagged. v1.5.1: the
 * part of a loss above its coverage part's occurrence limit (the part's own
 * sublimit, else the policy's headline limit) is retained above limit, kept
 * separate so the deductible retention stays comparable across options.
 */
export function replayYear(year: ReplayYear, deductible: number | ReplayDeductible, aggregateCap: number | null): Calc<YearReplay> {
  const defaultAmount = typeof deductible === "number" ? deductible : deductible.defaultAmount;
  if (!Number.isFinite(defaultAmount) || defaultAmount < 0) throw new Error(`Expected a non-negative deductible, received ${defaultAmount}`);
  const rules = typeof deductible === "number" ? [] : deductible.rules.filter((r) => !r.isDefault);
  const headlineLimit = typeof deductible === "number" ? null : (deductible.defaultOccurrenceLimit ?? null);
  const terms: string[] = [];
  const aboveTerms: string[] = [];
  const parts: number[] = [];
  const aboves: number[] = [];
  const included: number[] = [];
  const excludedClaims: { claimNumber: string; reason: string }[] = [];
  let scheduledClaims = 0;
  for (const c of year.claims) {
    const matched = rules.length ? matchRule(rules, c.peril).value : null;
    const rule = matched && !matched.isDefault ? matched : flatRule(defaultAmount);
    const d = rule.kind === "flat" && rule.amount !== null ? { amount: rule.amount, flags: [] as string[] } : deductibleForClaim(rule, c.adjustedIncurred, c.valueAtRisk).value;
    if (d.amount === null) {
      excludedClaims.push({ claimNumber: c.claimNumber, reason: `${c.peril}: ${d.flags.join("; ") || "no dollar deductible"}` });
      continue;
    }
    if (matched && !matched.isDefault) scheduledClaims += 1;
    const limit = (matched && !matched.isDefault ? matched.occurrenceLimit : null) ?? headlineLimit;
    const above = retainedAboveLimit(c.adjustedIncurred, limit).value;
    const part = Math.min(c.adjustedIncurred, d.amount);
    parts.push(part);
    aboves.push(above);
    included.push(c.adjustedIncurred);
    terms.push(`min(${usd(c.adjustedIncurred)}, ${usd(d.amount)}${matched && !matched.isDefault ? ` ${c.peril}` : ""})`);
    if (above > 0) aboveTerms.push(`max(0, ${usd(c.adjustedIncurred)} − ${usd(limit!)}${matched && !matched.isDefault ? ` ${c.peril} limit` : " policy limit"}) = ${usd(above)}`);
  }
  const incurredReplayed = sumMoney(included);
  const retainedBeforeCap = sumMoney(parts);
  const capApplied = aggregateCap !== null && retainedBeforeCap > aggregateCap;
  const retained = capApplied ? aggregateCap : retainedBeforeCap;
  const aboveLimit = sumMoney(aboves);
  const transferred = round2(incurredReplayed - retained - aboveLimit);
  const line =
    `${year.label}: retained = ${terms.length ? terms.join(" + ") : "no claims"} = ${usd(retainedBeforeCap)}` +
    (aggregateCap !== null ? `; min(${usd(retainedBeforeCap)}, cap ${usd(aggregateCap)}) = ${usd(retained)}` : "") +
    (aboveLimit > 0 ? `; retained above limit = ${aboveTerms.join(" + ")} = ${usd(aboveLimit)}` : "") +
    `; transferred = ${usd(incurredReplayed)} − ${usd(retained)}${aboveLimit > 0 ? ` − ${usd(aboveLimit)}` : ""} = ${usd(transferred)}` +
    (excludedClaims.length ? `; excluded ${excludedClaims.map((e) => `${e.claimNumber} (${e.reason})`).join(", ")}` : "");
  return {
    value: { label: year.label, year: year.year, current: year.current, claimCount: year.claims.length - excludedClaims.length, incurred: incurredReplayed, retainedBeforeCap, retained, capApplied, retainedAboveLimit: aboveLimit, transferred, excludedClaims, scheduledClaims },
    math: {
      inputs: { year: year.label, deductible: defaultAmount, aggregateCap, scheduleRules: rules.map(describeRule), headlineLimit },
      formula: "retained = Σ min(incurred, deductible for the claim's peril), then min(retained, aggregate cap); retained above limit = Σ max(0, incurred − the part's occurrence limit); transferred = incurred − retained − retained above limit",
      steps: { lines: [line] },
    },
  };
}

function basisLabel(adjustments: Adjustments): string {
  const parts = [adjustments.trendRate !== null ? `trend ${group(adjustments.trendRate * 100, 1)}%` : null, adjustments.factors ? "development" : null].filter(Boolean);
  return parts.length ? `adjusted: ${parts.join(" + ")}` : "raw incurred";
}

/**
 * The retention optimizer. Options are compared with the lowest-deductible option
 * (ties: lowest premium) as the base. Nothing here recommends an option.
 */
export function analyzeRetentionOptions(grouped: ClaimsByPolicyYear, options: RetentionOption[], settings: ReplaySettings = DEFAULT_REPLAY_SETTINGS): Calc<RetentionAnalysis> {
  const selected = selectReplayYears(grouped, settings);
  const years = selected.value.years;
  const n = years.length;
  const lines: string[] = [...(selected.math.steps.lines as string[])];
  const sorted = [...options].sort((a, b) => a.deductible - b.deductible || a.premium - b.premium);
  const base = sorted[0] ?? null;

  const withSchedule = !!settings.schedule?.length || settings.defaultOccurrenceLimit != null;
  const replays = sorted.map((o) => {
    const rows = years.map((y) => replayYear(y, withSchedule ? { defaultAmount: o.deductible, rules: settings.schedule ?? [], defaultOccurrenceLimit: settings.defaultOccurrenceLimit ?? null } : o.deductible, o.aggregateCap));
    for (const r of rows) lines.push(`${o.label}, ${(r.math.steps.lines as string[])[0]}`);
    return { option: o, rows: rows.map((r) => r.value) };
  });
  const perOption = new Map<string, { averageRetained: number; worst: YearReplay | null; rows: YearReplay[] }>();
  for (const { option, rows } of replays) {
    const averageRetained = n > 0 ? round2(sumMoney(rows.map((r) => r.retained)) / n) : 0;
    const worst = rows.reduce<YearReplay | null>((w, r) => (w === null || r.retained > w.retained ? r : w), null);
    perOption.set(option.id, { averageRetained, worst, rows });
    lines.push(
      `${option.label}: average retained = (${rows.map((r) => usd(r.retained)).join(" + ") || "$0"}) ÷ ${n} = ${usd2(averageRetained)}` +
        (worst ? `; worst year ${worst.label} at ${usd(worst.retained)}` : ""),
    );
  }
  const baseStats = base ? perOption.get(base.id)! : null;
  const busiest = years.reduce<ReplayYear | null>((b, y) => (b === null || y.claims.length > b.claims.length ? y : b), null);

  const analysed: OptionAnalysis[] = replays.map(({ option, rows }) => {
    const stats = perOption.get(option.id)!;
    const isBase = base !== null && option.id === base.id;
    const premiumSaving = base ? round2(base.premium - option.premium) : 0;
    const additionalRetained = baseStats ? round2(stats.averageRetained - baseStats.averageRetained) : 0;
    const netSaving = round2(premiumSaving - additionalRetained);
    const averageRetainedAboveLimit = n > 0 ? round2(sumMoney(rows.map((r) => r.retainedAboveLimit)) / n) : 0;
    const expectedTotalCost = round2(option.premium + stats.averageRetained + averageRetainedAboveLimit);
    const worstYearTotalCost = round2(option.premium + (stats.worst?.retained ?? 0));
    const averageTransferred = n > 0 ? round2(sumMoney(rows.map((r) => r.transferred)) / n) : 0;
    let worstYearTest: WorstYearTest | null = null;
    if (!isBase && stats.worst && baseStats) {
      const baseSameYear = baseStats.rows.find((r) => r.label === stats.worst!.label)?.retained ?? 0;
      const additional = round2(stats.worst.retained - baseSameYear);
      const cost = round2(additional - premiumSaving);
      const sentence =
        cost > 0
          ? `In ${stats.worst.label} this option would have cost ${usd(cost)} more than the base.`
          : cost < 0
            ? `In ${stats.worst.label} this option would still have saved ${usd(-cost)} against the base.`
            : `In ${stats.worst.label} this option would have cost the same as the base.`;
      worstYearTest = { label: stats.worst.label, optionRetained: stats.worst.retained, baseRetained: baseSameYear, additionalRetained: additional, premiumSaving, costVersusBase: cost, sentence };
      lines.push(`${option.label}: worst year ${stats.worst.label} retained ${usd(stats.worst.retained)} − base ${usd(baseSameYear)} = ${usd(additional)} additional vs saving ${usd(premiumSaving)} → ${sentence}`);
    }
    const byClaims = round2(option.deductible * (busiest?.claims.length ?? 0));
    const maxAnnualExposure: MaxExposure =
      option.aggregateCap !== null && option.aggregateCap < byClaims
        ? { value: option.aggregateCap, basis: "aggregate cap", claimCount: busiest?.claims.length ?? 0, claimYear: busiest?.label ?? null }
        : { value: byClaims, basis: "deductible × claims", claimCount: busiest?.claims.length ?? 0, claimYear: busiest?.label ?? null };
    lines.push(
      `${option.label}: expected total cost = ${usd(option.premium)} + ${usd2(stats.averageRetained)}${averageRetainedAboveLimit > 0 ? ` + ${usd2(averageRetainedAboveLimit)} above limit` : ""} = ${usd2(expectedTotalCost)}` +
        (isBase
          ? " (base)"
          : `; premium saving = ${usd(base!.premium)} − ${usd(option.premium)} = ${usd(premiumSaving)}; additional retained = ${usd2(stats.averageRetained)} − ${usd2(baseStats!.averageRetained)} = ${usd2(additionalRetained)}; net = ${usd(premiumSaving)} − ${usd2(additionalRetained)} = ${usd2(netSaving)}; break-even additional retained = ${usd(premiumSaving)}`) +
        `; max annual exposure = ${maxAnnualExposure.basis === "aggregate cap" ? `cap ${usd(option.aggregateCap!)} (below ${usd(option.deductible)} × ${maxAnnualExposure.claimCount} = ${usd(byClaims)})` : `${usd(option.deductible)} × ${maxAnnualExposure.claimCount} claims (${maxAnnualExposure.claimYear ?? "no years"}) = ${usd(byClaims)}`}`,
    );
    return {
      option,
      isBase,
      years: rows,
      averageRetained: stats.averageRetained,
      averageTransferred,
      worstYear: stats.worst ? { label: stats.worst.label, retained: stats.worst.retained, claimCount: stats.worst.claimCount } : null,
      averageRetainedAboveLimit,
      expectedTotalCost,
      worstYearTotalCost,
      premiumSaving,
      additionalRetained,
      netSaving,
      breakEvenRetained: premiumSaving,
      worstYearTest,
      maxAnnualExposure,
    };
  });

  return {
    value: {
      years,
      omittedYears: selected.value.omitted,
      baseOptionId: base?.id ?? null,
      options: analysed,
      adjusted: settings.adjustments.trendRate !== null || settings.adjustments.factors !== null,
      prospectiveYear: grouped.prospectiveYear,
      basisLabel: basisLabel(settings.adjustments),
      anyAboveLimit: analysed.some((o) => o.years.some((y) => y.retainedAboveLimit > 0)),
    },
    math: {
      inputs: { line: grouped.line, asOf: grouped.asOf, options: sorted.map((o) => ({ label: o.label, deductible: o.deductible, cap: o.aggregateCap, premium: o.premium })), settings: { ...settings, schedule: (settings.schedule ?? []).map(describeRule) } },
      formula:
        "per year: retained = Σ min(incurred, deductible), then min(·, cap); retained above limit = Σ max(0, incurred − part occurrence limit); average and worst over the years used; vs the lowest-deductible base: premium saving, additional retained, expected total cost = premium + average retained + average retained above limit, net = saving − additional, break-even = saving, worst-year test, max exposure = deductible × most claims in a year (or the cap)",
      steps: { lines },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Total cost of risk                                                  */
/* ------------------------------------------------------------------ */

export interface TcorPremium {
  label: string;
  amount: number;
  /** True for the analysed line, whose premium is the option's. */
  substituted: boolean;
}

export interface TcorRetained {
  label: string;
  /** Average retained per year; null when the line has no loss runs (counted as zero and flagged). */
  amount: number | null;
  /** True for the analysed line, whose figure is the option's average retained. */
  analysed: boolean;
}

export interface TcorInputs {
  optionLabel: string;
  premiums: TcorPremium[];
  retained: TcorRetained[];
  brokerFees: number;
  riskControlSpend: number;
  claimsAdminCost: number;
  revenue: number | null;
}

export const TCOR_COMPONENTS = ["premiums", "retained", "brokerFees", "riskControl", "claimsAdmin"] as const;
export type TcorComponent = (typeof TCOR_COMPONENTS)[number];
export const TCOR_COMPONENT_LABELS: Record<TcorComponent, string> = {
  premiums: "Premiums",
  retained: "Expected retained losses",
  brokerFees: "Broker fees",
  riskControl: "Risk control spend",
  claimsAdmin: "Internal claims administration",
};

export interface Tcor {
  optionLabel: string;
  components: Record<TcorComponent, number>;
  total: number;
  percentOfRevenue: number | null;
  perThousandRevenue: number | null;
  /** Lines counted at zero retained because they have no loss runs. */
  flagged: string[];
}

/** TCOR = premiums + expected retained + broker fees + risk control + claims administration, in dollars, % of revenue and per $1,000 of revenue. */
export function totalCostOfRisk(i: TcorInputs): Calc<Tcor> {
  for (const [k, v] of Object.entries({ brokerFees: i.brokerFees, riskControlSpend: i.riskControlSpend, claimsAdminCost: i.claimsAdminCost })) {
    if (!Number.isFinite(v) || v < 0) throw new Error(`Expected a non-negative ${k}, received ${v}`);
  }
  const premiums = sumMoney(i.premiums.map((p) => p.amount));
  const retained = sumMoney(i.retained.map((r) => r.amount ?? 0));
  const flagged = i.retained.filter((r) => r.amount === null).map((r) => r.label);
  const components: Record<TcorComponent, number> = { premiums, retained, brokerFees: i.brokerFees, riskControl: i.riskControlSpend, claimsAdmin: i.claimsAdminCost };
  const total = sumMoney(Object.values(components));
  const hasRevenue = i.revenue !== null && i.revenue > 0;
  const percentOfRevenue = hasRevenue ? total / i.revenue! : null;
  const perThousandRevenue = hasRevenue ? round2(total / (i.revenue! / 1000)) : null;
  const lines = [
    `Premiums = ${i.premiums.map((p) => `${usd(p.amount)}${p.substituted ? ` (${p.label}, option premium)` : ""}`).join(" + ") || "$0"} = ${usd(premiums)}`,
    `Expected retained = ${i.retained.map((r) => (r.amount === null ? `$0 (${r.label}: no loss runs, flagged)` : `${usd2(r.amount)}${r.analysed ? ` (${r.label}, option average)` : ""}`)).join(" + ") || "$0"} = ${usd2(retained)}`,
    `TCOR = ${usd(premiums)} + ${usd2(retained)} + fees ${usd(i.brokerFees)} + risk control ${usd(i.riskControlSpend)} + claims administration ${usd(i.claimsAdminCost)} = ${usd2(total)}`,
    hasRevenue ? `% of revenue = ${usd2(total)} ÷ ${usd(i.revenue!)} = ${r4(percentOfRevenue!)} (${group(percentOfRevenue! * 100, 2)}%)` : "% of revenue: — (annual revenue not entered)",
    hasRevenue ? `Per $1,000 of revenue = ${usd2(total)} ÷ (${usd(i.revenue!)} ÷ 1,000) = ${usd2(perThousandRevenue!)}` : "Per $1,000 of revenue: — (annual revenue not entered)",
  ];
  return {
    value: { optionLabel: i.optionLabel, components, total, percentOfRevenue, perThousandRevenue, flagged },
    math: {
      inputs: { optionLabel: i.optionLabel, premiums: i.premiums, retained: i.retained, brokerFees: i.brokerFees, riskControlSpend: i.riskControlSpend, claimsAdminCost: i.claimsAdminCost, revenue: i.revenue },
      formula: "TCOR = premiums + expected retained losses + broker fees + risk control spend + internal claims administration; ÷ revenue for the percent; ÷ (revenue ÷ 1,000) for the per-$1,000 figure",
      steps: { lines },
    },
  };
}

/**
 * Another line's expected retained losses: its five most recent policy years
 * (current year included) limited to the line's current deductible, raw.
 * Null when the line has no claims and no policy periods to use.
 */
export function otherLineRetained(claims: LRClaim[], policies: LRPolicy[], line: LineOfBusiness, deductible: number | null, asOf: ISODate): Calc<{ averageRetained: number | null; years: number; reason: string | null }> {
  const grouped = groupClaimsByPolicyYear(claims, policies, line, asOf).value;
  if (deductible === null) {
    return { value: { averageRetained: null, years: 0, reason: "no deductible on the policy" }, math: { inputs: { line, deductible }, formula: "no deductible: nothing is retained below it", steps: { lines: [`${line}: no deductible entered, so expected retained is not estimated`] } } };
  }
  if (grouped.years.length === 0) {
    return { value: { averageRetained: null, years: 0, reason: "no policy periods" }, math: { inputs: { line, deductible }, formula: "no periods to use", steps: { lines: [`${line}: no policy periods start on or before ${longDate(asOf)}`] } } };
  }
  const hasClaims = grouped.years.some((y) => y.claims.length > 0);
  if (!hasClaims) {
    return { value: { averageRetained: null, years: grouped.years.length, reason: "no loss runs" }, math: { inputs: { line, deductible }, formula: "no claims in the line", steps: { lines: [`${line}: no claims recorded, so expected retained is counted as zero and flagged`] } } };
  }
  const selected = selectReplayYears(grouped, DEFAULT_REPLAY_SETTINGS).value.years;
  const rows = selected.map((y) => replayYear(y, deductible, null).value);
  const averageRetained = round2(sumMoney(rows.map((r) => r.retained)) / rows.length);
  return {
    value: { averageRetained, years: rows.length, reason: null },
    math: {
      inputs: { line, deductible, asOf },
      formula: "average over the five most recent policy years of Σ min(incurred, deductible)",
      steps: { lines: [`${line}: (${rows.map((r) => `${r.label} ${usd(r.retained)}`).join(" + ")}) ÷ ${rows.length} = ${usd2(averageRetained)} below the ${usd(deductible)} deductible`] },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Considerations (neutral)                                            */
/* ------------------------------------------------------------------ */

export interface Consideration {
  topic: string;
  /** What the data shows, in one sentence. */
  observation: string;
  favoursLower: string;
  favoursHigher: string;
}

export interface ConsiderationInputs {
  years: ReplayYear[];
  revenue: number | null;
}

/** What favours a lower and a higher retention, each stated for the account's own figures. Never a recommendation. */
export function considerations(i: ConsiderationInputs): Calc<Consideration[]> {
  const n = i.years.length;
  const totals = i.years.map((y) => y.incurred);
  const openReserved = sumMoney(i.years.map((y) => y.openReserved));
  const openCount = i.years.reduce((s, y) => s + y.openCount, 0);
  const maxIncurred = Math.max(0, ...totals);
  const minIncurred = n ? Math.min(...totals) : 0;
  const avgIncurred = n ? round2(sumMoney(totals) / n) : 0;
  const complete = i.years.filter((y) => !y.current);
  const firstHalf = complete.slice(0, Math.floor(complete.length / 2));
  const secondHalf = complete.slice(Math.floor(complete.length / 2));
  const avg = (ys: ReplayYear[]) => (ys.length ? ys.reduce((s, y) => s + y.claims.length, 0) / ys.length : 0);
  const trendWord = complete.length < 2 ? "cannot be read from fewer than two complete years" : avg(secondHalf) > avg(firstHalf) ? "is rising" : avg(secondHalf) < avg(firstHalf) ? "is falling" : "is flat";
  const items: Consideration[] = [
    {
      topic: "Cash flow",
      observation: i.revenue !== null ? `Annual revenue is ${usd(i.revenue)}; the worst year's incurred was ${usd(maxIncurred)}.` : "Annual revenue is not entered, so retained losses cannot be set against it.",
      favoursLower: "Retained losses are paid as claims settle, so a business with tight cash or seasonal income has less room to absorb a bad year.",
      favoursHigher: "A business that can fund the maximum annual exposure from cash keeps the premium saving in every year that stays below break-even.",
    },
    {
      topic: "Claim volatility",
      observation: n ? `Incurred ranged from ${usd(minIncurred)} to ${usd(maxIncurred)} across the ${n} years used (average ${usd2(avgIncurred)}).` : "No years are in use.",
      favoursLower: "Wide swings between years mean the average understates how bad a single year can be.",
      favoursHigher: "Years that cluster near the average make the expected retained figure more dependable.",
    },
    {
      topic: "Frequency trend",
      observation: n ? `Claim counts by year: ${i.years.map((y) => `${y.label} ${y.claims.length}${y.current ? " (current year)" : ""}`).join(", ")}; frequency ${trendWord}.` : "No years are in use.",
      favoursLower: "Rising frequency means more claims fall inside the deductible each year than the history shows.",
      favoursHigher: "Falling frequency means the history overstates future retained losses.",
    },
    {
      topic: "Open reserves",
      observation: openCount ? `${openCount} open claim${openCount === 1 ? " carries" : "s carry"} ${usd(openReserved)} of reserves that can still move.` : "No open claims in the years used.",
      favoursLower: "Open reserves can develop upward, pushing more of each claim across the deductible than the history counts.",
      favoursHigher: "Reserves that close below their estimate reduce what was retained.",
    },
  ];
  return {
    value: items,
    math: {
      inputs: { years: i.years.map((y) => y.label), revenue: i.revenue },
      formula: "each topic states the account's own figure, then what favours a lower and a higher retention; no weighting, no score",
      steps: { lines: items.map((c) => `${c.topic}: ${c.observation}`) },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Assumptions and limitations                                         */
/* ------------------------------------------------------------------ */

export interface AssumptionInputs {
  line: LineOfBusiness;
  asOf: ISODate;
  settings: ReplaySettings;
  yearsUsed: { label: string; current: boolean }[];
  omittedYears: { label: string; reason: string }[];
  prospectiveYear: number | null;
  /** `source` says where each option's premium came from: entered by hand (manual) or estimated by the findings engine. */
  options: { label: string; aggregateCap: number | null; source: "manual" | "estimated" }[];
  /** Items the report could not fill, e.g. "Annual revenue not entered". */
  missing: string[];
  /** Lines counted at zero retained in TCOR because they have no loss runs. */
  linesWithoutLossRuns: string[];
  /** The policy's non-default deductible rules in force, described (v1.3). */
  scheduleRules?: string[];
  /** v1.4: the tolerances and permissible loss ratio behind the findings, and which premiums the replay used. */
  tolerances?: ToleranceSettings | null;
  premiumSource?: "manual" | "estimated";
}

/** The report's Assumptions and limitations, generated from the settings actually used. */
export function assumptionsAndLimitations(i: AssumptionInputs): Calc<string[]> {
  const a = i.settings.adjustments;
  const lines: string[] = [];
  const used = i.yearsUsed.map((y) => `${y.label}${y.current ? " (current year, incomplete)" : ""}`);
  lines.push(`Loss history: ${i.line} claims over ${i.yearsUsed.length} policy year${i.yearsUsed.length === 1 ? "" : "s"} (${used.join(", ") || "none"}), as of ${longDate(i.asOf)}.`);
  const running = i.yearsUsed.find((y) => y.current);
  if (running) lines.push(`${running.label} is the current year: its claims are incomplete and it is counted as a full year.`);
  for (const o of i.omittedYears) lines.push(`${o.label} is not used: ${o.reason}.`);
  lines.push(
    a.trendRate === null
      ? "No loss trend is applied: older years are at their original cost levels."
      : `Loss trend of ${group(a.trendRate * 100, 1)}% a year restates each year to ${i.prospectiveYear ?? "the prospective year"}: factor = (1 + trend) ^ (${i.prospectiveYear ?? "prospective year"} − policy year).`,
  );
  lines.push(
    a.factors === null
      ? "No loss development is applied: open claims are at their current paid plus reserved."
      : `Development factors by age: 12 months ${r4(a.factors["12"])}, 24 months ${r4(a.factors["24"])}, 36 months ${r4(a.factors["36"])}, 48 months ${r4(a.factors["48"])}, 60+ months ${r4(a.factors["60+"])}; entered by the user, not derived from this account.`,
  );
  const capped = i.options.filter((o) => o.aggregateCap !== null);
  lines.push(
    capped.length
      ? `Aggregate caps: ${capped.map((o) => `${o.label} capped at ${usd(o.aggregateCap!)} a year`).join("; ")}; other options have no cap.`
      : "No option has an aggregate cap: retained losses are limited only by the deductible on each claim.",
  );
  if (i.scheduleRules && i.scheduleRules.length) {
    lines.push(`Deductible schedule in force: ${i.scheduleRules.join("; ")}. Each option replaces only the all-other-perils deductible; claims whose peril matches a schedule rule keep that rule's deductible.`);
  }
  const manual = i.options.filter((o) => o.source === "manual");
  if (manual.length) lines.push(`Premiums for ${manual.map((o) => o.label).join(", ")} were entered by hand and are not quotes.`);
  const estimated = i.options.filter((o) => o.source === "estimated");
  if (estimated.length) lines.push(`Premiums for ${estimated.map((o) => o.label).join(", ")} are estimated from the loss history and the permissible loss ratio; they are not quotes.`);
  if (i.tolerances) {
    lines.push(`Risk tolerance used for the findings: ${usd(i.tolerances.perOccurrence)} per occurrence and ${usd(i.tolerances.perYear)} per policy year; permissible loss ratio ${r4(i.tolerances.permissibleLossRatio)}.`);
    lines.push("Estimated premiums are derived from the loss history and this ratio; they are not quotes. Findings are heuristics on historical losses and the tolerances above, for discussion, not decisions.");
  }
  if (i.premiumSource) lines.push(i.premiumSource === "estimated" ? "Estimated premiums were used for every option." : "Premiums entered by hand were used where one exists and estimated premiums elsewhere.");
  if (i.linesWithoutLossRuns.length) lines.push(`Total cost of risk counts expected retained losses as zero for ${i.linesWithoutLossRuns.join(", ")} because no claims are recorded for ${i.linesWithoutLossRuns.length === 1 ? "that line" : "those lines"}.`);
  for (const m of i.missing) lines.push(`${m}.`);
  lines.push(
    "Method: each option applies its deductible to the account's actual claims, year by year. It does not fit a loss distribution, weight the account's experience against industry data, or model claims larger than any seen; a year unlike the past will not be predicted by it.",
  );
  lines.push("This report compares options; it does not state which the client should buy.");
  return {
    value: lines,
    math: {
      inputs: { line: i.line, asOf: i.asOf, settings: i.settings, yearsUsed: i.yearsUsed, omittedYears: i.omittedYears, options: i.options, missing: i.missing, linesWithoutLossRuns: i.linesWithoutLossRuns },
      formula: "one sentence per setting actually in use, plus the method's limits",
      steps: { lines },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Automatic findings (v1.4)                                           */
/* ------------------------------------------------------------------ */

export interface ToleranceSettings {
  /** Most the client would retain on one occurrence, in dollars. */
  perOccurrence: number;
  /** Most the client would retain in one policy year, in dollars. */
  perYear: number;
  /** Share of premium expected to pay losses; divides retained-loss changes into premium credits. */
  permissibleLossRatio: number;
}

export const DEFAULT_PERMISSIBLE_LOSS_RATIO = 0.65;
export const DEFAULT_TOLERANCE_OCCURRENCE_SHARE = 0.005;
export const DEFAULT_TOLERANCE_YEAR_SHARE = 0.01;
/** A band is "working" when its history shows losses, or when losses reach it more often than this per year. */
export const WORKING_BAND_FREQUENCY = 0.2;
/** Estimated premiums never fall below this share of the current premium. */
export const PREMIUM_FLOOR_SHARE = 0.25;
/** A participation priced this far above its layer's other lines is flagged. */
export const LINE_PRICE_THRESHOLD = 0.25;
/** A renewal rate change this many points above the exposure change is flagged. */
export const RATE_CHANGE_THRESHOLD = 0.1;
/** A program top this far above the TIV is flagged as excess limit. */
export const EXCESS_LIMIT_SHARE = 0.1;

/** Default tolerances: 0.5% of revenue per occurrence, 1% per policy year; null without a revenue figure. */
export function defaultTolerances(revenue: number | null): Calc<{ perOccurrence: number | null; perYear: number | null }> {
  const perOccurrence = revenue !== null && revenue > 0 ? round2(revenue * DEFAULT_TOLERANCE_OCCURRENCE_SHARE) : null;
  const perYear = revenue !== null && revenue > 0 ? round2(revenue * DEFAULT_TOLERANCE_YEAR_SHARE) : null;
  return {
    value: { perOccurrence, perYear },
    math: {
      inputs: { revenue },
      formula: "per occurrence = 0.5% of annual revenue; per policy year = 1% of annual revenue",
      steps: { lines: revenue !== null && revenue > 0 ? [`${usd(revenue)} × 0.5% = ${usd(perOccurrence!)} per occurrence; × 1% = ${usd(perYear!)} per year`] : ["Annual revenue not entered: no default tolerances"] },
    },
  };
}

export type FindingKind = "self_insure" | "raise_deductible" | "partial_line" | "catastrophe_price" | "inverted_pricing" | "line_above_layer" | "rate_above_exposure" | "underinsured" | "excess_limit";

export interface Finding {
  /** Stable key so an acceptance can be stored, e.g. "self_insure:<layerId>". */
  id: string;
  kind: FindingKind;
  title: string;
  /** Numbers that support the finding, one per line. */
  evidence: string[];
  /** Dollars per year the finding is about (saving, excess premium, unplaced limit); null when it is a comment. */
  estimatedImpact: number | null;
  caveats: string[];
  /** One sentence; "candidate" wording, never a decision. */
  suggestedAction: string;
  math: string[];
}

export interface BandResult {
  id: string;
  towerLabel: string;
  label: string;
  /** Dollars from which the band responds and how much it can pay per occurrence. */
  attachment: number;
  limit: number;
  /** Actual premium paid for the band, Σ over its insurers (null for the deductible band, which the client already retains). */
  premium: number | null;
  /** v1.5: the layer's 100% equivalent premium (layer premium ÷ placed share); what a 1% line is worth per point. */
  premium100Equivalent: number | null;
  perYear: { label: string; inBand: number; count: number }[];
  averageInBand: number;
  worstYear: { label: string; inBand: number } | null;
  inBandClaims: number;
  /** Claims reaching the band per year of history. */
  frequency: number;
  classification: "working" | "catastrophe";
  isDeductibleBand: boolean;
}

export interface BandAnalysisInput {
  years: ReplayYear[];
  layers: ProgramLayerInput[];
  defaultDeductible: number | null;
  tolerances: ToleranceSettings;
  /** Total insured value, when known; sets the program top for the under-placed sentence on partial-line candidates. */
  tiv?: number | null;
}

/**
 * Bottom-up band analysis. For each layer (and the deductible band below the
 * primary): in-band losses per year = Σ min(max(incurred − attachment, 0), limit).
 * A primary attaching at zero responds above the default deductible, so its band
 * runs from the deductible to its limit.
 */
export function bandAnalysis(i: BandAnalysisInput): Calc<{ bands: BandResult[]; findings: Finding[] }> {
  const n = i.years.length;
  const lines: string[] = [];
  const bands: BandResult[] = [];
  const findings: Finding[] = [];
  const ded = i.defaultDeductible ?? 0;
  const inBandOf = (attachment: number, limit: number) =>
    i.years.map((y) => {
      const parts = y.claims.map((c) => Math.min(Math.max(c.adjustedIncurred - attachment, 0), limit));
      return { label: y.label, inBand: sumMoney(parts), count: parts.filter((p) => p > 0).length };
    });
  const describe = (b: Omit<BandResult, "classification">) => {
    const classification: BandResult["classification"] = b.inBandClaims > 0 || b.frequency > WORKING_BAND_FREQUENCY ? "working" : "catastrophe";
    lines.push(
      `${b.towerLabel} ${b.label} (${usd(b.attachment)} to ${usd(b.attachment + b.limit)}): in-band by year ${b.perYear.map((y) => `${y.label} ${usd(y.inBand)}`).join(", ") || "none"}; average ${usd2(b.averageInBand)}; worst ${b.worstYear ? `${b.worstYear.label} ${usd(b.worstYear.inBand)}` : "—"}; ${b.inBandClaims} claims reached it (${r4(b.frequency)} a year) → ${classification}`,
    );
    return { ...b, classification };
  };
  const summarize = (id: string, towerLabel: string, label: string, attachment: number, limit: number, premium: number | null, premium100Equivalent: number | null, isDeductibleBand: boolean): BandResult => {
    const perYear = inBandOf(attachment, limit);
    const averageInBand = n ? round2(sumMoney(perYear.map((y) => y.inBand)) / n) : 0;
    const worst = perYear.reduce<{ label: string; inBand: number } | null>((w, y) => (y.inBand > 0 && (w === null || y.inBand > w.inBand) ? { label: y.label, inBand: y.inBand } : w), null);
    const inBandClaims = perYear.reduce((s, y) => s + y.count, 0);
    return describe({ id, towerLabel, label, attachment, limit, premium, premium100Equivalent, perYear, averageInBand, worstYear: worst, inBandClaims, frequency: n ? inBandClaims / n : 0, isDeductibleBand });
  };

  if (i.defaultDeductible !== null && i.defaultDeductible > 0) bands.push(summarize("deductible", "Retained", `${compact(i.defaultDeductible)} deductible`, 0, i.defaultDeductible, null, null, true));
  for (const l of i.layers) {
    const s = layerSummary(l).value;
    const attachment = l.attachment === 0 ? ded : l.attachment;
    const limit = l.attachment === 0 ? Math.max(0, l.limit - ded) : l.limit;
    bands.push(summarize(l.id, l.towerLabel, s.label, attachment, limit, s.layerPremium, s.premium100Equivalent, false));
  }
  // Segment shortfalls, for the sentence a partial-line candidate adds when its layer is short of 100%.
  const profile = i.layers.length ? coverageProfile(i.layers, i.tiv ?? null).value : null;

  const t = i.tolerances;
  const deductibleBand = bands.find((b) => b.isDeductibleBand) ?? null;
  for (const b of bands) {
    if (b.isDeductibleBand || b.premium === null) continue;
    const expectedAtPlr = round2(b.averageInBand / t.permissibleLossRatio);
    const priceHigh = b.premium > expectedAtPlr;
    const findingMath = [
      `Average in-band losses ${usd2(b.averageInBand)} ÷ permissible loss ratio ${r4(t.permissibleLossRatio)} = ${usd2(expectedAtPlr)} premium the losses alone would support; layer premium ${usd(b.premium)}`,
      `Band limit ${usd(b.limit)} vs per-occurrence tolerance ${usd(t.perOccurrence)}; worst year in band ${b.worstYear ? usd(b.worstYear.inBand) : "$0"} vs annual tolerance ${usd(t.perYear)}`,
    ];
    if (b.classification === "catastrophe") {
      const multi = i.layers.find((l) => l.id === b.id)?.participations.length ?? 0;
      findings.push({
        id: `catastrophe_price:${b.id}`,
        kind: "catastrophe_price",
        title: `${b.towerLabel} ${b.label}: catastrophe band, price only`,
        evidence: [`No in-band losses in ${n} year${n === 1 ? "" : "s"}`, `Premium ${usd(b.premium)} for ${usd(b.limit)} of limit (rate on line ${b.limit > 0 ? pctShare(b.premium / b.limit) : "—"})`],
        estimatedImpact: null,
        caveats: ["A band with no history is not a band without risk; the loss history cannot show a loss larger than any that has happened.", ...(multi > 1 ? ["Several insurers share this layer: a smaller signed share is an alternative to dropping it."] : [])],
        suggestedAction: multi > 1 ? "Candidate for a price discussion only; if cost must fall, reduce the signed share rather than drop the layer." : "Candidate for a price discussion only; retention is not proposed for a band with no loss history.",
        math: findingMath,
      });
      continue;
    }
    const withinOccurrence = b.limit <= t.perOccurrence;
    const withinYear = (b.worstYear?.inBand ?? 0) <= t.perYear;
    if (withinOccurrence && withinYear && priceHigh) {
      const saving = round2(b.premium - b.averageInBand);
      const worstCost = round2((b.worstYear?.inBand ?? 0) - b.premium);
      findings.push({
        id: `self_insure:${b.id}`,
        kind: "self_insure",
        title: `${b.towerLabel} ${b.label}: candidate to self-insure this band`,
        evidence: [
          `Layer premium ${usd(b.premium)} against average in-band losses ${usd2(b.averageInBand)} a year`,
          `Worst year ${b.worstYear ? `${b.worstYear.label} ${usd(b.worstYear.inBand)}` : "$0"} within the ${usd(t.perYear)} annual tolerance; band limit ${usd(b.limit)} within the ${usd(t.perOccurrence)} per-occurrence tolerance`,
          `Break-even: in-band losses of ${usd(b.premium)} in a year cost the same as the premium`,
        ],
        estimatedImpact: saving,
        caveats: ["Average saving from the loss history; a year worse than the history would cost more.", worstCost > 0 ? `In ${b.worstYear!.label} self-insuring would have cost ${usd(worstCost)} more than the premium.` : "Even the worst year in the history stayed below the premium."],
        suggestedAction: `Candidate to self-insure the ${b.label} band: expected saving ${usd(saving)} a year, break-even at ${usd(b.premium)} of in-band losses.`,
        math: [...findingMath, `Saving = ${usd(b.premium)} − ${usd2(b.averageInBand)} = ${usd2(saving)}; worst-year cost = ${usd(b.worstYear?.inBand ?? 0)} − ${usd(b.premium)} = ${usd2(worstCost)}`],
      });
      continue;
    }
    if (!withinOccurrence && priceHigh && b.attachment === ded && t.perOccurrence > ded) {
      const belowTolerance = inBandOf(ded, t.perOccurrence - ded);
      const avgBelow = n ? round2(sumMoney(belowTolerance.map((y) => y.inBand)) / n) : 0;
      const credit = Math.round(avgBelow / t.permissibleLossRatio);
      findings.push({
        id: `raise_deductible:${b.id}`,
        kind: "raise_deductible",
        title: `${b.towerLabel} ${b.label}: candidate to raise the deductible to ${usd(t.perOccurrence)}`,
        evidence: [
          `Band limit ${usd(b.limit)} exceeds the ${usd(t.perOccurrence)} per-occurrence tolerance, so self-insuring the whole band is not proposed`,
          `Losses between ${usd(ded)} and ${usd(t.perOccurrence)} averaged ${usd(Math.round(avgBelow))} a year; at a ${r4(t.permissibleLossRatio)} loss ratio that supports an estimated credit of ${usd(Math.round(credit))}`,
          `Layer premium ${usd(b.premium)} against ${usd(Math.round(expectedAtPlr))} the in-band losses alone would support`,
        ],
        estimatedImpact: credit,
        caveats: ["The credit is an estimate from loss history and the permissible loss ratio, not a quote.", "Check the worst-year test on the generated option against the annual tolerance."],
        suggestedAction: `Candidate to raise the deductible to ${usd(t.perOccurrence)}; the option is generated below with its estimated premium.`,
        math: [...findingMath, `Average losses ${usd(ded)} to ${usd(t.perOccurrence)} = (${belowTolerance.map((y) => usd(y.inBand)).join(" + ") || "$0"}) ÷ ${n} = ${usd2(avgBelow)}; ÷ ${r4(t.permissibleLossRatio)} = ${usd2(credit)}`],
      });
    }
    // v1.5: a partial line on a band too large to retain whole. The client takes the largest whole-percent
    // line that keeps line × band limit within the per-occurrence tolerance and line × worst-year in-band
    // losses within the annual tolerance; the saving is that share of the layer's 100% equivalent premium.
    if (!withinOccurrence && b.premium100Equivalent !== null && b.premium100Equivalent > 0 && b.limit > 0) {
      const worstInBand = b.worstYear?.inBand ?? 0;
      const byOccurrence = Math.floor((t.perOccurrence / b.limit) * 100 + 1e-9);
      const byYear = worstInBand > 0 ? Math.floor((t.perYear / worstInBand) * 100 + 1e-9) : 100;
      const line = Math.max(0, Math.min(100, byOccurrence, byYear));
      const lineMath = `Client line = largest whole % with line × ${usd(b.limit)} ≤ ${usd(t.perOccurrence)} (→ ${byOccurrence}%) and line × ${usd(worstInBand)} ≤ ${usd(t.perYear)} (→ ${worstInBand > 0 ? `${byYear}%` : "no limit"}) = ${line}%`;
      if (line < 1) {
        lines.push(`${b.towerLabel} ${b.label}: ${lineMath}; below 1%, so no partial-line candidate`);
      } else {
        const share = line / 100;
        const saving = round2(b.premium100Equivalent * share);
        const expectedRetained = round2(b.averageInBand * share);
        const worstRetained = round2(worstInBand * share);
        const net = round2(saving - expectedRetained);
        const exposure = round2(b.limit * share);
        lines.push(
          `${b.towerLabel} ${b.label}: ${lineMath}; saving = ${line}% × ${usd(b.premium100Equivalent)} = ${usd2(saving)}; expected retained = ${line}% × ${usd2(b.averageInBand)} = ${usd2(expectedRetained)}; worst-year retained = ${line}% × ${usd(worstInBand)} = ${usd2(worstRetained)}; net = ${usd2(saving)} − ${usd2(expectedRetained)} = ${usd2(net)} → ${net > 0 ? "candidate" : "no candidate"}`,
        );
        if (net > 0) {
          const layer = i.layers.find((l) => l.id === b.id) ?? null;
          const shortSegments = profile && layer ? profile.segments.filter((seg) => seg.status === "under_placed" && layer.attachment <= seg.from && layer.attachment + layer.limit >= seg.to) : [];
          const shortSentences = shortSegments.map((seg) => {
            const from = round2(seg.shortfallShare * 100);
            const to = Math.max(0, round2(from - line));
            return `This line would also reduce the unplaced share of the segment from ${group(from, 2).replace(/\.?0+$/, "")}% to ${group(to, 2).replace(/\.?0+$/, "")}%.`;
          });
          findings.push({
            id: `partial_line:${b.id}`,
            kind: "partial_line",
            title: `${b.towerLabel} ${b.label}: candidate for the client to retain a ${line}% line`,
            evidence: [
              `Band limit ${usd(b.limit)} exceeds the ${usd(t.perOccurrence)} per-occurrence tolerance; a ${line}% line exposes ${usd(exposure)} per occurrence and ${usd(worstRetained)} in the worst year${b.worstYear ? ` (${b.worstYear.label})` : ""}, within both tolerances`,
              `Premium saving ${usd(saving)} a year, ${line}% of the layer's ${usd(b.premium100Equivalent)} 100% equivalent premium, against expected retained ${usd2(expectedRetained)} (${line}% of average in-band losses ${usd2(b.averageInBand)})`,
              `Net expected saving ${usd2(net)} a year`,
              ...shortSentences,
            ],
            estimatedImpact: net,
            caveats: ["The client would sit alongside the insurers on this band and share every loss in it pro rata; the saving assumes the insurers' 100% premium holds at the smaller share.", "Average saving from the loss history; a year worse than the history would cost more."],
            suggestedAction: `Candidate: client retains a ${line}% line of ${b.towerLabel} ${b.label} alongside the insurers; recommended for discussion.${shortSentences.length ? ` ${shortSentences.join(" ")}` : ""}`,
            math: [
              ...findingMath,
              `In-band losses above the deductible: average ${usd2(b.averageInBand)}, worst year ${usd(worstInBand)}`,
              lineMath,
              `Saving = ${line}% × ${usd(b.premium100Equivalent)} = ${usd2(saving)}; expected retained = ${line}% × ${usd2(b.averageInBand)} = ${usd2(expectedRetained)}; worst-year retained = ${line}% × ${usd(worstInBand)} = ${usd2(worstRetained)}; net expected saving = ${usd2(saving)} − ${usd2(expectedRetained)} = ${usd2(net)}`,
            ],
          });
        }
      }
    }
  }
  if (deductibleBand) lines.push(`The ${deductibleBand.label} band is what the client retains today: average ${usd2(deductibleBand.averageInBand)} a year.`);
  return {
    value: { bands, findings },
    math: {
      inputs: { years: i.years.map((y) => y.label), layers: i.layers.length, defaultDeductible: i.defaultDeductible, tolerances: i.tolerances },
      formula:
        "in-band losses = Σ min(max(incurred − attachment, 0), limit); working = any in-band loss or frequency > 0.2 a year; self-insure when limit ≤ per-occurrence tolerance, worst year ≤ annual tolerance and premium > average in-band ÷ permissible loss ratio; partial line = largest whole % with line × band limit ≤ per-occurrence tolerance and line × worst-year in-band ≤ annual tolerance, candidate when line × 100% equivalent premium − line × average in-band > 0",
      steps: { lines },
    },
  };
}

const compact = (n: number) => (n >= 1_000_000 ? `$${+(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${+(n / 1_000).toFixed(1)}K` : `$${n}`);
const pctShare = (ratio: number, d = 2) => `${group(ratio * 100, d)}%`;

export interface PriceFindingsInput {
  layers: ProgramLayerInput[];
  /** The latest renewal of the analysed line: expiring and renewal terms, when both exist. */
  latestRenewal?: { expiring: RateTerm; renewal: RateTerm } | null;
}

/**
 * Price findings: inverted pricing (a layer's rate on line at or above the one
 * below it in the same tower), a participation priced 25% or more above the
 * premium-weighted rate on line of the other lines on its layer, and a renewal
 * whose rate change exceeded its exposure change by ten points or more.
 */
export function priceFindings(i: PriceFindingsInput): Calc<Finding[]> {
  const findings: Finding[] = [];
  const lines: string[] = [];
  for (const tower of towerLabels(i.layers)) {
    const sorted = i.layers
      .filter((l) => l.towerLabel === tower)
      .map((l) => layerSummary(l).value)
      .sort((a, b) => a.layer.attachment - b.layer.attachment);
    for (let k = 1; k < sorted.length; k += 1) {
      const below = sorted[k - 1];
      const layer = sorted[k];
      if (layer.rateOnLine === null || below.rateOnLine === null) continue;
      lines.push(`${tower}: ${layer.label} ${pctShare(layer.rateOnLine, 4)} on line vs ${below.label} ${pctShare(below.rateOnLine, 4)} below`);
      if (layer.rateOnLine >= below.rateOnLine) {
        const atBelowRate = Math.round(below.rateOnLine * layer.placedLimit);
        const difference = Math.round(layer.layerPremium - atBelowRate);
        findings.push({
          id: `inverted_pricing:${layer.layer.id}`,
          kind: "inverted_pricing",
          title: `${tower} ${layer.label}: priced at or above the layer below`,
          evidence: [`Rate on line ${pctShare(layer.rateOnLine, 4)} vs ${pctShare(below.rateOnLine, 4)} for ${below.label}`, `Premium ${usd(layer.layerPremium)}; at the lower layer's rate it would be ${usd(atBelowRate)}, a difference of ${usd(difference)}`],
          estimatedImpact: difference,
          caveats: ["Higher layers normally cost less per dollar of limit; a different basis, a loss-affected layer or a thin market can explain an inversion."],
          suggestedAction: `Candidate for a price discussion: ${usd(difference)} above the layer below's rate on line, recommended for discussion with the market.`,
          math: [`${usd(layer.layerPremium)} ÷ ${usd(layer.placedLimit)} = ${r4(layer.rateOnLine)} ≥ ${usd(below.layerPremium)} ÷ ${usd(below.placedLimit)} = ${r4(below.rateOnLine)}`, `At the lower rate: ${r4(below.rateOnLine)} × ${usd(layer.placedLimit)} = ${usd(atBelowRate)}; difference ${usd(layer.layerPremium)} − ${usd(atBelowRate)} = ${usd(difference)}`],
        });
      }
    }
  }
  for (const l of i.layers) {
    const s = layerSummary(l).value;
    if (s.participations.length < 2) continue;
    for (const p of s.participations) {
      if (p.rateOnLine === null) continue;
      const others = s.participations.filter((o) => o.id !== p.id);
      const otherPremium = sumMoney(others.map((o) => o.actualPremium));
      const otherExposed = sumMoney(others.map((o) => o.exposedLimit));
      if (otherExposed <= 0) continue;
      const average = otherPremium / otherExposed;
      const above = average > 0 ? p.rateOnLine / average - 1 : null;
      lines.push(`${l.towerLabel} ${s.label}, ${p.insurer}: ${pctShare(p.rateOnLine, 4)} vs other lines ${usd(otherPremium)} ÷ ${usd(otherExposed)} = ${pctShare(average, 4)}${above !== null ? ` (${group(above * 100, 0)}% ${above >= 0 ? "above" : "below"})` : ""}`);
      if (above !== null && above >= LINE_PRICE_THRESHOLD) {
        const atAverage = Math.round(average * p.exposedLimit);
        const difference = Math.round(p.actualPremium - atAverage);
        findings.push({
          id: `line_above_layer:${p.id}`,
          kind: "line_above_layer",
          title: `${l.towerLabel} ${s.label}: ${p.insurer}'s line priced above the layer`,
          evidence: [`${p.insurer} ${pctShare(p.rateOnLine, 4)} on line vs ${pctShare(average, 4)} for the other ${others.length} line${others.length === 1 ? "" : "s"} (${group(above * 100, 0)}% above)`, `Actual premium ${usd(p.actualPremium)} (${usd(p.premium100)} at 100% × ${p.signedLinePct}%) for ${usd(p.exposedLimit)} exposed; at the layer average it would be ${usd(atAverage)}, a difference of ${usd(difference)}`],
          estimatedImpact: difference,
          caveats: ["A lead's line often carries the engineering and claims handling; compare terms as well as rate."],
          suggestedAction: `Candidate for a line-price discussion with ${p.insurer}: ${usd(difference)} above the layer's other lines, recommended for discussion.`,
          math: [`Other lines: ${usd(otherPremium)} ÷ ${usd(otherExposed)} = ${r4(average)}; ${p.insurer}: ${usd(p.premium100)} ÷ ${usd(l.limit)} = ${usd(p.actualPremium)} ÷ ${usd(p.exposedLimit)} = ${r4(p.rateOnLine)}; ${r4(p.rateOnLine)} ÷ ${r4(average)} − 1 = ${r4(above)}`, `At the average: ${r4(average)} × ${usd(p.exposedLimit)} = ${usd(atAverage)}; difference ${usd(difference)}`],
        });
      }
    }
  }
  if (i.latestRenewal) {
    const m = getRateMetrics(i.latestRenewal.expiring, i.latestRenewal.renewal).value;
    if (m.rateChange !== null && m.exposureChange !== null) {
      const gap = m.rateChange - m.exposureChange;
      lines.push(`Latest renewal: rate change ${r4(m.rateChange)} vs exposure change ${r4(m.exposureChange)} (gap ${r4(gap)})`);
      if (gap >= RATE_CHANGE_THRESHOLD) {
        const exposureAdjusted = Math.round(i.latestRenewal.expiring.premium * (1 + m.exposureChange));
        const difference = Math.round(i.latestRenewal.renewal.premium - exposureAdjusted);
        findings.push({
          id: "rate_above_exposure:latest",
          kind: "rate_above_exposure",
          title: "Latest renewal: rate rose faster than exposure",
          evidence: [`Rate change ${pctShare(m.rateChange, 1)} vs exposure change ${pctShare(m.exposureChange, 1)}, a gap of ${group(gap * 100, 1)} points`, `Premium ${usd(i.latestRenewal.renewal.premium)} against ${usd(exposureAdjusted)} had the prior term's rate simply followed exposure: ${usd(difference)} more`],
          estimatedImpact: difference,
          caveats: ["Rate movements can reflect market cycle or loss experience rather than this account alone."],
          suggestedAction: `Candidate to question the ${group(gap * 100, 1)}-point rate increase above exposure growth, ${usd(difference)} on this term, recommended for discussion.`,
          math: [`${m.sentence}`, `Exposure-adjusted prior premium = ${usd(i.latestRenewal.expiring.premium)} × (1 + ${r4(m.exposureChange)}) = ${usd(exposureAdjusted)}; difference ${usd(i.latestRenewal.renewal.premium)} − ${usd(exposureAdjusted)} = ${usd(difference)}`],
        });
      }
    }
  }
  return {
    value: findings,
    math: { inputs: { layers: i.layers.length, latestRenewal: !!i.latestRenewal }, formula: "inverted = rate on line ≥ layer below; line above layer = rate on line ≥ 1.25 × Σ other premiums ÷ Σ other exposed limits; rate change − exposure change ≥ 10 points", steps: { lines } },
  };
}

/** Property limit adequacy: program top against the TIV. */
export function limitAdequacy(layers: ProgramLayerInput[], tiv: number | null): Calc<Finding | null> {
  if (tiv === null || tiv <= 0 || layers.length === 0) {
    return { value: null, math: { inputs: { layers: layers.length, tiv }, formula: "program top vs TIV", steps: { lines: ["No TIV or no layers: nothing to compare"] } } };
  }
  const summaries = layers.map((l) => layerSummary(l).value);
  const top = Math.max(...summaries.map((s) => s.exhaustion));
  const topLayer = summaries.filter((s) => s.exhaustion === top).sort((a, b) => (b.rateOnLine ?? 0) - (a.rateOnLine ?? 0))[0];
  const lines = [`Program top ${usd(top)} vs TIV ${usd(tiv)}`];
  let value: Finding | null = null;
  if (top < tiv) {
    const gap = round2(tiv - top);
    value = {
      id: "underinsured:program",
      kind: "underinsured",
      title: `Underinsured by ${usd(gap)} against TIV`,
      evidence: [`Program top ${usd(top)} against a total insured value of ${usd(tiv)}`],
      estimatedImpact: gap,
      caveats: ["A deliberate limit below TIV (a loss limit) may be intended; confirm the basis of the TIV."],
      suggestedAction: `Candidate to extend the program by ${usd(gap)} to reach the TIV, recommended for discussion.`,
      math: [`${usd(tiv)} − ${usd(top)} = ${usd(gap)}`],
    };
  } else if (top > tiv * (1 + EXCESS_LIMIT_SHARE)) {
    const excess = round2(top - tiv);
    const rate = topLayer?.rateOnLine ?? 0;
    const premiumOnExcess = Math.round(excess * rate * (topLayer?.placedShare ?? 1));
    value = {
      id: "excess_limit:program",
      kind: "excess_limit",
      title: `Limit exceeds TIV by ${usd(excess)}`,
      evidence: [`Program top ${usd(top)} is ${group((top / tiv - 1) * 100, 1)}% above the ${usd(tiv)} TIV`, `Premium on the excess portion is about ${usd(premiumOnExcess)} at the top layer's ${pctShare(rate, 4)} rate on line`],
      estimatedImpact: premiumOnExcess,
      caveats: ["Limits above TIV can be deliberate (debris removal, inflation guard, business interruption)."],
      suggestedAction: `Candidate to review ${usd(excess)} of limit above the TIV, worth about ${usd(premiumOnExcess)} of premium, recommended for discussion.`,
      math: [`${usd(top)} − ${usd(tiv)} = ${usd(excess)}; × ${r4(rate)} × placed share ${r4(topLayer?.placedShare ?? 1)} = ${usd(premiumOnExcess)}`],
    };
  } else lines.push("Within 10% of the TIV: no finding");
  if (value) lines.push(...value.math);
  return { value, math: { inputs: { layers: layers.length, tiv }, formula: "below TIV → underinsured by the gap; above TIV by more than 10% → excess limit priced at the top layer's rate on line", steps: { lines } } };
}

export interface EstimatedPremium {
  premium: number;
  credit: number;
  increaseInRetained: number;
  floored: boolean;
}

/** Estimated premium = current premium − (increase in average retained vs the current deductible) ÷ permissible loss ratio, floored at 25% of the current premium. */
export function estimatePremium(currentPremium: number, increaseInRetained: number, permissibleLossRatio: number): Calc<EstimatedPremium> {
  if (!Number.isFinite(permissibleLossRatio) || permissibleLossRatio <= 0 || permissibleLossRatio > 1) throw new Error(`Expected a permissible loss ratio between 0 and 1, received ${permissibleLossRatio}`);
  const credit = Math.round(increaseInRetained / permissibleLossRatio);
  const raw = round2(currentPremium - credit);
  const floor = round2(currentPremium * PREMIUM_FLOOR_SHARE);
  const floored = raw < floor;
  const premium = floored ? floor : raw;
  return {
    value: { premium, credit, increaseInRetained, floored },
    math: {
      inputs: { currentPremium, increaseInRetained, permissibleLossRatio },
      formula: "credit = increase in average retained ÷ permissible loss ratio; estimated premium = current premium − credit, floored at 25% of the current premium",
      steps: { lines: [`${usd2(increaseInRetained)} ÷ ${r4(permissibleLossRatio)} = ${usd(credit)} credit; ${usd(currentPremium)} − ${usd(credit)} = ${usd(raw)}${floored ? ` → floored at 25% = ${usd(floor)}` : ""}`] },
    },
  };
}

/** Nearest-rank percentile of claim severities, rounded to the nearest $5,000 (nearest $25,000 above $100,000). */
export function severityPercentile(severities: number[], percentile: number): Calc<{ raw: number | null; rounded: number | null }> {
  const sorted = [...severities].filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return { value: { raw: null, rounded: null }, math: { inputs: { claims: 0, percentile }, formula: "nearest rank", steps: { lines: ["No claims"] } } };
  const rank = Math.max(1, Math.ceil(percentile * sorted.length));
  const raw = sorted[rank - 1];
  const step = raw > 100_000 ? 25_000 : 5_000;
  const rounded = Math.max(step, Math.round(raw / step) * step);
  return {
    value: { raw, rounded },
    math: { inputs: { claims: sorted.length, percentile }, formula: "rank = ⌈p × n⌉; value rounded to the nearest $5,000 ($25,000 above $100,000)", steps: { lines: [`p${Math.round(percentile * 100)}: rank ${rank} of ${sorted.length} = ${usd(raw)} → ${usd(rounded)}`] } },
  };
}

export interface AutomaticOption {
  deductible: number;
  /** Where the deductible came from. */
  source: "current" | "tolerance" | "p50" | "p75" | "p90" | "manual";
  averageRetained: number;
  worstYear: { label: string; retained: number } | null;
  increaseInRetained: number;
  estimated: EstimatedPremium;
  withinAnnualTolerance: boolean;
}

export interface AutomaticOptionsInput {
  years: ReplayYear[];
  currentDeductible: number;
  /** Premium at the current deductible: the manual option at that deductible, else the expiring premium. */
  currentPremium: number;
  tolerances: ToleranceSettings;
  schedule?: DeductibleRule[];
  /** Deductibles entered by hand that are not in the automatic set; they get an estimate too. */
  extraDeductibles?: number[];
}

/**
 * The automatic option set: the current deductible, the per-occurrence tolerance
 * and the 50th, 75th and 90th severity percentiles, de-duplicated and replayed;
 * each option's premium is estimated from the change in average retained losses.
 */
export function automaticOptions(i: AutomaticOptionsInput): Calc<AutomaticOption[]> {
  const n = i.years.length;
  const severities = i.years.flatMap((y) => y.claims.map((c) => c.adjustedIncurred));
  const candidates: { deductible: number; source: AutomaticOption["source"] }[] = [{ deductible: i.currentDeductible, source: "current" }, { deductible: i.tolerances.perOccurrence, source: "tolerance" }];
  const lines: string[] = [];
  for (const [p, source] of [[0.5, "p50"], [0.75, "p75"], [0.9, "p90"]] as const) {
    const pct = severityPercentile(severities, p);
    lines.push(...(pct.math.steps.lines as string[]));
    if (pct.value.rounded !== null) candidates.push({ deductible: pct.value.rounded, source });
  }
  for (const d of i.extraDeductibles ?? []) candidates.push({ deductible: d, source: "manual" });
  const seen = new Set<number>();
  const unique = candidates.filter((c) => c.deductible > 0 && !seen.has(c.deductible) && seen.add(c.deductible)).sort((a, b) => a.deductible - b.deductible);
  const retainedFor = (deductible: number) => i.years.map((y) => replayYear(y, i.schedule?.length ? { defaultAmount: deductible, rules: i.schedule } : deductible, null).value);
  const currentRows = retainedFor(i.currentDeductible);
  const currentAverage = n ? round2(sumMoney(currentRows.map((r) => r.retained)) / n) : 0;
  const value = unique.map((c) => {
    const rows = retainedFor(c.deductible);
    const averageRetained = n ? round2(sumMoney(rows.map((r) => r.retained)) / n) : 0;
    const worst = rows.reduce<{ label: string; retained: number } | null>((w, r) => (w === null || r.retained > w.retained ? { label: r.label, retained: r.retained } : w), null);
    const increaseInRetained = round2(averageRetained - currentAverage);
    const estimated = estimatePremium(i.currentPremium, increaseInRetained, i.tolerances.permissibleLossRatio).value;
    lines.push(
      `${usd(c.deductible)} (${c.source}): retained ${rows.map((r) => `${r.label} ${usd(r.retained)}`).join(", ")}; average ${usd2(averageRetained)}; increase vs ${usd(i.currentDeductible)} = ${usd2(averageRetained)} − ${usd2(currentAverage)} = ${usd2(increaseInRetained)}; credit ${usd(estimated.credit)}; estimated premium ${usd(estimated.premium)}${estimated.floored ? " (floored)" : ""}; worst ${worst ? `${worst.label} ${usd(worst.retained)}` : "—"} ${worst && worst.retained <= i.tolerances.perYear ? "within" : "above"} the ${usd(i.tolerances.perYear)} annual tolerance`,
    );
    return { deductible: c.deductible, source: c.source, averageRetained, worstYear: worst, increaseInRetained, estimated, withinAnnualTolerance: (worst?.retained ?? 0) <= i.tolerances.perYear };
  });
  return {
    value,
    math: {
      inputs: { currentDeductible: i.currentDeductible, currentPremium: i.currentPremium, tolerances: i.tolerances, years: i.years.map((y) => y.label) },
      formula: "options = current deductible, per-occurrence tolerance, p50/p75/p90 severities (rounded); estimated premium = current − (average retained increase ÷ permissible loss ratio), floored at 25%",
      steps: { lines },
    },
  };
}

export interface Modifier {
  key: "frequency_trend" | "open_reserves" | "few_years";
  text: string;
}

/** Plain-word modifiers: frequency trend, open-reserve share, and a warning for thin history. */
export function modifiers(years: ReplayYear[]): Calc<Modifier[]> {
  const complete = years.filter((y) => !y.current);
  const half = Math.floor(complete.length / 2);
  const avg = (ys: ReplayYear[]) => (ys.length ? ys.reduce((s, y) => s + y.claims.length, 0) / ys.length : 0);
  const first = avg(complete.slice(0, half));
  const second = avg(complete.slice(half));
  const trend = complete.length < 2 ? "unknown" : second > first ? "rising" : second < first ? "falling" : "flat";
  const incurred = sumMoney(years.map((y) => y.incurred));
  const openReserved = sumMoney(years.map((y) => y.openReserved));
  const share = incurred > 0 ? openReserved / incurred : 0;
  const out: Modifier[] = [
    { key: "frequency_trend", text: complete.length < 2 ? "Frequency trend cannot be read from fewer than two complete years." : `Claim frequency is ${trend} over the history (${first.toFixed(1)} a year in the earlier half, ${second.toFixed(1)} in the later half); ${trend === "rising" ? "the history understates what is coming" : trend === "falling" ? "the history overstates it" : "the history is a fair guide"}.` },
    { key: "open_reserves", text: incurred > 0 ? `${pctShare(share, 1)} of incurred (${usd(openReserved)} of ${usd(incurred)}) is still in open reserves and can move either way.` : "No incurred losses in the years used." },
  ];
  if (years.length < 3) out.push({ key: "few_years", text: `Only ${years.length} year${years.length === 1 ? "" : "s"} of history: the findings are weak and should carry little weight.` });
  return {
    value: out,
    math: { inputs: { years: years.map((y) => y.label) }, formula: "trend from claim counts in the earlier and later halves of complete years; open share = open reserves ÷ incurred", steps: { lines: out.map((m) => m.text) } },
  };
}

export interface StrategyFindingsInput extends BandAnalysisInput {
  tiv: number | null;
  latestRenewal?: PriceFindingsInput["latestRenewal"];
  currentPremium: number;
  schedule?: DeductibleRule[];
}

export interface StrategyFindings {
  findings: Finding[];
  bands: BandResult[];
  options: AutomaticOption[];
  modifiers: Modifier[];
}

/** Everything the Strategy tab shows, with findings sorted by estimated impact (comments last). */
export function strategyFindings(i: StrategyFindingsInput): Calc<StrategyFindings> {
  const bands = bandAnalysis(i);
  const price = priceFindings({ layers: i.layers, latestRenewal: i.latestRenewal ?? null });
  const adequacy = limitAdequacy(i.layers, i.tiv);
  const options = i.defaultDeductible !== null && i.defaultDeductible >= 0 ? automaticOptions({ years: i.years, currentDeductible: i.defaultDeductible, currentPremium: i.currentPremium, tolerances: i.tolerances, schedule: i.schedule }) : null;
  const mods = modifiers(i.years);
  const findings = [...bands.value.findings, ...price.value, ...(adequacy.value ? [adequacy.value] : [])].sort((a, b) => (b.estimatedImpact ?? -1) - (a.estimatedImpact ?? -1));
  return {
    value: { findings, bands: bands.value.bands, options: options?.value ?? [], modifiers: mods.value },
    math: {
      inputs: { tolerances: i.tolerances, tiv: i.tiv, currentPremium: i.currentPremium, defaultDeductible: i.defaultDeductible },
      formula: "bands, price findings and limit adequacy, sorted by estimated impact; options from the automatic set",
      steps: { lines: [...(bands.math.steps.lines as string[]), ...(price.math.steps.lines as string[]), ...(adequacy.math.steps.lines as string[]), ...((options?.math.steps.lines as string[]) ?? []), ...(mods.math.steps.lines as string[])] },
    },
  };
}
