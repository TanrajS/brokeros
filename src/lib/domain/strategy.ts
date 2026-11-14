/**
 * Strategy (v1.2): retention optimizer, total cost of risk, considerations and
 * the report's assumptions. Pure: claims, policies, options and settings in;
 * { value, math } out. No React, no database, no clock.
 *
 * The optimizer is a historical replay: every claim in the years chosen is run
 * through each option's deductible (and aggregate cap). It does not fit a loss
 * distribution or weight the account's own experience against an industry
 * expectation; the Assumptions section says so.
 */
import type { ClaimStatus, LineOfBusiness } from "@/lib/constants";
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
      .map(({ claim }) => ({ id: claim.id, claimNumber: claim.claimNumber, status: claim.status, paid: claim.paid, reserved: claim.reserved, incurred: incurred(claim.paid, claim.reserved).value }));
    const age = developmentAge(period.effectiveDate, asOf).value;
    const open = rows.filter((r) => r.status === "open");
    const total = sumMoney(rows.map((r) => r.incurred));
    const isCurrent = current?.policyId === period.policyId;
    lines.push(`${period.label}${isCurrent ? " (running year, incomplete)" : ""}: ${rows.length} claims, incurred ${rows.map((r) => usd(r.incurred)).join(" + ") || "$0"} = ${usd(total)}; age ${age.months} months → ${age.bucket}`);
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
  /** Policy years to replay, most recent first (default 5). */
  yearsToUse: number;
  /** Whether the running (incomplete) year counts as one of them (default true). */
  includeCurrentYear: boolean;
  /** Trend and development from the Loss Runs tab (default both off). */
  adjustments: Adjustments;
}

export const DEFAULT_REPLAY_SETTINGS: ReplaySettings = { yearsToUse: 5, includeCurrentYear: true, adjustments: { trendRate: null, factors: null } };

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
  transferred: number;
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
  /** premium + average retained. */
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
}

/** Picks the years to replay and restates each claim on the chosen basis. */
export function selectReplayYears(grouped: ClaimsByPolicyYear, settings: ReplaySettings): Calc<{ years: ReplayYear[]; omitted: { label: string; reason: string }[] }> {
  const { adjustments } = settings;
  const omitted: { label: string; reason: string }[] = [];
  let pool = grouped.years;
  const current = pool.find((y) => y.current);
  if (current && !settings.includeCurrentYear) {
    pool = pool.filter((y) => !y.current);
    omitted.push({ label: current.label, reason: "running year excluded by the settings" });
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
      `${y.label}${y.current ? " (running year, incomplete)" : ""}: ${claims.length} claims` +
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
      formula: "the most recent N policy years (running year optional); adjusted incurred = incurred × trend factor × development factor",
      steps: { lines },
    },
  };
}

/** One option against one year: Σ min(incurred, deductible), then min(·, cap). */
export function replayYear(year: ReplayYear, deductible: number, aggregateCap: number | null): Calc<YearReplay> {
  if (!Number.isFinite(deductible) || deductible < 0) throw new Error(`Expected a non-negative deductible, received ${deductible}`);
  const parts = year.claims.map((c) => Math.min(c.adjustedIncurred, deductible));
  const retainedBeforeCap = sumMoney(parts);
  const capApplied = aggregateCap !== null && retainedBeforeCap > aggregateCap;
  const retained = capApplied ? aggregateCap : retainedBeforeCap;
  const transferred = round2(year.incurred - retained);
  const line =
    `${year.label}: retained = ${parts.length ? parts.map((p, i) => `min(${usd(year.claims[i].adjustedIncurred)}, ${usd(deductible)})`).join(" + ") : "no claims"} = ${usd(retainedBeforeCap)}` +
    (aggregateCap !== null ? `; min(${usd(retainedBeforeCap)}, cap ${usd(aggregateCap)}) = ${usd(retained)}` : "") +
    `; transferred = ${usd(year.incurred)} − ${usd(retained)} = ${usd(transferred)}`;
  return {
    value: { label: year.label, year: year.year, current: year.current, claimCount: year.claims.length, incurred: year.incurred, retainedBeforeCap, retained, capApplied, transferred },
    math: { inputs: { year: year.label, deductible, aggregateCap }, formula: "retained = Σ min(incurred, deductible), then min(retained, aggregate cap); transferred = incurred − retained", steps: { lines: [line] } },
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

  const replays = sorted.map((o) => {
    const rows = years.map((y) => replayYear(y, o.deductible, o.aggregateCap));
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
    const expectedTotalCost = round2(option.premium + stats.averageRetained);
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
      `${option.label}: expected total cost = ${usd(option.premium)} + ${usd2(stats.averageRetained)} = ${usd2(expectedTotalCost)}` +
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
    },
    math: {
      inputs: { line: grouped.line, asOf: grouped.asOf, options: sorted.map((o) => ({ label: o.label, deductible: o.deductible, cap: o.aggregateCap, premium: o.premium })), settings },
      formula:
        "per year: retained = Σ min(incurred, deductible), then min(·, cap); average and worst over the years used; vs the lowest-deductible base: premium saving, additional retained, expected total cost = premium + average retained, net = saving − additional, break-even = saving, worst-year test, max exposure = deductible × most claims in a year (or the cap)",
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
 * (running year included) replayed below the line's current deductible, raw.
 * Null when the line has no claims and no policy periods to replay.
 */
export function otherLineRetained(claims: LRClaim[], policies: LRPolicy[], line: LineOfBusiness, deductible: number | null, asOf: ISODate): Calc<{ averageRetained: number | null; years: number; reason: string | null }> {
  const grouped = groupClaimsByPolicyYear(claims, policies, line, asOf).value;
  if (deductible === null) {
    return { value: { averageRetained: null, years: 0, reason: "no deductible on the policy" }, math: { inputs: { line, deductible }, formula: "no deductible: nothing is retained below it", steps: { lines: [`${line}: no deductible entered, so expected retained is not estimated`] } } };
  }
  if (grouped.years.length === 0) {
    return { value: { averageRetained: null, years: 0, reason: "no policy periods" }, math: { inputs: { line, deductible }, formula: "no periods to replay", steps: { lines: [`${line}: no policy periods start before the as-of date`] } } };
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
  /** Contract requirements that apply to the analysed line, as short labels. */
  contractRequirements: string[];
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
      observation: i.revenue !== null ? `Annual revenue is ${usd(i.revenue)}; the worst replayed year's incurred was ${usd(maxIncurred)}.` : "Annual revenue is not entered, so retained losses cannot be set against it.",
      favoursLower: "Retained losses are paid as claims settle, so a business with tight cash or seasonal income has less room to absorb a bad year.",
      favoursHigher: "A business that can fund the maximum annual exposure from cash keeps the premium saving in every year that stays below break-even.",
    },
    {
      topic: "Claim volatility",
      observation: n ? `Incurred ranged from ${usd(minIncurred)} to ${usd(maxIncurred)} across the ${n} years used (average ${usd2(avgIncurred)}).` : "No years are in use.",
      favoursLower: "Wide swings between years mean the replay average understates how bad a single year can be.",
      favoursHigher: "Years that cluster near the average make the expected retained figure more dependable.",
    },
    {
      topic: "Frequency trend",
      observation: n ? `Claim counts by year: ${i.years.map((y) => `${y.label} ${y.claims.length}${y.current ? " (running)" : ""}`).join(", ")}; frequency ${trendWord}.` : "No years are in use.",
      favoursLower: "Rising frequency means more claims fall inside the deductible each year than the replay shows.",
      favoursHigher: "Falling frequency means the replay overstates future retained losses.",
    },
    {
      topic: "Open reserves",
      observation: openCount ? `${openCount} open claim${openCount === 1 ? " carries" : "s carry"} ${usd(openReserved)} of reserves that can still move.` : "No open claims in the years used.",
      favoursLower: "Open reserves can develop upward, pushing more of each claim across the deductible than the replay counts.",
      favoursHigher: "Reserves that close below their estimate reduce what was retained.",
    },
    {
      topic: "Contract requirements",
      observation: i.contractRequirements.length ? `${i.contractRequirements.length} contract requirement${i.contractRequirements.length === 1 ? " applies" : "s apply"} to this line: ${i.contractRequirements.join("; ")}.` : "No contract requirements are recorded for this line.",
      favoursLower: "Some contracts cap the deductible a counterparty will accept; check each one before raising retention.",
      favoursHigher: "Where no contract constrains the deductible, the choice is the client's alone.",
    },
  ];
  return {
    value: items,
    math: {
      inputs: { years: i.years.map((y) => y.label), contractRequirements: i.contractRequirements, revenue: i.revenue },
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
  options: { label: string; aggregateCap: number | null; linkedToQuote: boolean }[];
  /** Items the report could not fill, e.g. "Annual revenue not entered". */
  missing: string[];
  /** Lines counted at zero retained in TCOR because they have no loss runs. */
  linesWithoutLossRuns: string[];
}

/** The report's Assumptions and limitations, generated from the settings actually used. */
export function assumptionsAndLimitations(i: AssumptionInputs): Calc<string[]> {
  const a = i.settings.adjustments;
  const lines: string[] = [];
  const used = i.yearsUsed.map((y) => `${y.label}${y.current ? " (running year, incomplete)" : ""}`);
  lines.push(`Loss history: ${i.line} claims replayed over ${i.yearsUsed.length} policy year${i.yearsUsed.length === 1 ? "" : "s"} (${used.join(", ") || "none"}), as of ${i.asOf}.`);
  const running = i.yearsUsed.find((y) => y.current);
  if (running) lines.push(`${running.label} is the running year: its claims are incomplete and its figures are counted as a full year.`);
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
  const unlinked = i.options.filter((o) => !o.linkedToQuote);
  if (unlinked.length) lines.push(`Premiums for ${unlinked.map((o) => o.label).join(", ")} were entered by hand and are not tied to a carrier quote.`);
  if (i.linesWithoutLossRuns.length) lines.push(`Total cost of risk counts expected retained losses as zero for ${i.linesWithoutLossRuns.join(", ")} because no claims are recorded for ${i.linesWithoutLossRuns.length === 1 ? "that line" : "those lines"}.`);
  for (const m of i.missing) lines.push(`${m}.`);
  lines.push(
    "Method: a historical replay of the account's own claims, each limited to the deductible. It does not fit a loss distribution, weight the account's experience against industry data, or model claims larger than any seen; a year unlike the past will not be predicted by it.",
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
