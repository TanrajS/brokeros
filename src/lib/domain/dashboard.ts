/**
 * Dashboard metrics (v0.3). Pure: plain arrays of policies and accounts plus the
 * as-of date and window definitions in; { value, math } out. No React, no
 * database, no clock. `math.steps.lines` is the human-readable "Show the math".
 */
import type { LineOfBusiness, LostReason, OutcomeType, RenewalStatus } from "@/lib/constants";
import { addDays, addMonths, daysBetween } from "./dates";
import { checklistReadiness, type Readiness } from "./renewals";
import type { Calc, ISODate } from "./types";

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export interface DashOutcome {
  type: OutcomeType;
  lostReason: LostReason | null;
  reason: string | null;
  competingPremium: number | null;
  successorPolicyId: string | null;
}

export interface DashPolicy {
  id: string;
  accountId: string;
  lineOfBusiness: LineOfBusiness;
  carrier: string;
  effectiveDate: ISODate;
  expiryDate: ISODate;
  annualPremium: number;
  /** Percent, e.g. 15 for 15%. */
  commissionRate: number;
  renewalStatus: RenewalStatus;
  outcome: DashOutcome | null;
  /** Checklist progress; when the checklist has not been opened, the template count with 0 done. */
  checklist: { done: number; total: number };
}

export interface DashAccount {
  id: string;
  name: string;
  producer: string | null;
}

export interface DateWindow {
  start: ISODate;
  end: ISODate;
  months: number;
}

/* ------------------------------------------------------------------ */
/* Formatting used only inside math lines                              */
/* ------------------------------------------------------------------ */

function group(n: number, decimals: number): string {
  const [int, frac] = Math.abs(n).toFixed(decimals).split(".");
  return `${n < 0 ? "−" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ? "." + frac : ""}`;
}
const usd = (n: number) => `$${group(n, 0)}`;
const usdCents = (n: number) => `$${group(n, 2)}`;
const pct = (ratio: number) => `${group(ratio * 100, 1)}%`;
const r4 = (n: number) => group(n, 4);
/** Sum in cents so money totals never drift. */
const sumMoney = (xs: number[]) => xs.reduce((c, x) => c + Math.round(x * 100), 0) / 100;

/* ------------------------------------------------------------------ */
/* Windows                                                             */
/* ------------------------------------------------------------------ */

export const LOOKBACK_MONTHS = [6, 12, 24] as const;
export const FORWARD_MONTHS = [3, 6, 12] as const;

/**
 * Trailing window ending at the as-of date, inclusive at both ends:
 * from (as-of − N months + 1 day) to the as-of date. 12 months is exactly one year of expiries.
 */
export function lookbackWindow(asOf: ISODate, months: number): Calc<DateWindow> {
  const back = addMonths(asOf, -months).value;
  const start = addDays(back, 1).value;
  return {
    value: { start, end: asOf, months },
    math: {
      inputs: { asOf, months },
      formula: "start = as-of − months + 1 day; end = as-of; both inclusive",
      steps: { back, start, end: asOf, lines: [`${back} + 1 day = ${start}`, `Window ${start} to ${asOf} inclusive`] },
    },
  };
}

/**
 * Forward window starting the day after the as-of date: from (as-of + 1 day) to
 * (as-of + N months), inclusive. A policy expiring on the as-of date has already
 * expired, so it belongs to the lookback window, never both.
 */
export function forwardWindow(asOf: ISODate, months: number): Calc<DateWindow> {
  const start = addDays(asOf, 1).value;
  const end = addMonths(asOf, months).value;
  return {
    value: { start, end, months },
    math: {
      inputs: { asOf, months },
      formula: "start = as-of + 1 day; end = as-of + months; both inclusive",
      steps: { start, end, lines: [`Window ${start} to ${end} inclusive`] },
    },
  };
}

export function inWindow(date: ISODate, w: DateWindow): boolean {
  return date >= w.start && date <= w.end;
}

/* ------------------------------------------------------------------ */
/* Producer filter                                                     */
/* ------------------------------------------------------------------ */

export function filterByProducer(
  accounts: DashAccount[],
  policies: DashPolicy[],
  producer: string | null,
): Calc<{ accounts: DashAccount[]; policies: DashPolicy[]; shownAccounts: number; totalAccounts: number }> {
  const shown = producer ? accounts.filter((a) => a.producer === producer) : accounts;
  const ids = new Set(shown.map((a) => a.id));
  const kept = policies.filter((p) => ids.has(p.accountId));
  return {
    value: { accounts: shown, policies: kept, shownAccounts: shown.length, totalAccounts: accounts.length },
    math: {
      inputs: { producer, accounts: accounts.length, policies: policies.length },
      formula: "keep accounts whose producer matches (all when none is selected) and the policies on those accounts",
      steps: { lines: [`${shown.length} of ${accounts.length} accounts, ${kept.length} of ${policies.length} policies`] },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Book                                                                */
/* ------------------------------------------------------------------ */

/** In force at the as-of date: effective ≤ as-of < expiry, and not lost or non-renewed. */
export function isInForce(p: DashPolicy, asOf: ISODate): boolean {
  return p.effectiveDate <= asOf && asOf < p.expiryDate && p.renewalStatus !== "lost" && p.renewalStatus !== "non_renewed";
}

export interface BookTiles {
  inForcePremium: number;
  inForceCount: number;
  activeAccounts: number;
  bookedCommission: number;
  /** Premium-weighted: booked commission ÷ in-force premium. Null when there is no in-force premium. */
  averageCommissionRate: number | null;
}

export function bookTiles(policies: DashPolicy[], asOf: ISODate): Calc<BookTiles> {
  const inForce = policies.filter((p) => isInForce(p, asOf));
  const inForcePremium = sumMoney(inForce.map((p) => p.annualPremium));
  const commissions = inForce.map((p) => p.annualPremium * (p.commissionRate / 100));
  const bookedCommission = sumMoney(commissions);
  const activeAccounts = new Set(inForce.map((p) => p.accountId)).size;
  const averageCommissionRate = inForcePremium > 0 ? bookedCommission / inForcePremium : null;
  const lines = [
    `In force = effective ≤ ${asOf} < expiry, status not lost or non-renewed: ${inForce.length} of ${policies.length} policies`,
    `In-force premium = sum of ${inForce.length} annual premiums = ${usd(inForcePremium)}`,
    `Active accounts = accounts with at least one in-force policy = ${activeAccounts}`,
    ...inForce.map((p, i) => `Commission ${i + 1}: ${usd(p.annualPremium)} × ${group(p.commissionRate, 3).replace(/\.?0+$/, "")}% = ${usdCents(commissions[i])}`),
    `Booked commission = ${usdCents(bookedCommission)}`,
    averageCommissionRate === null
      ? "Average commission rate: no in-force premium, so no rate"
      : `Average commission rate (premium-weighted) = ${usdCents(bookedCommission)} ÷ ${usd(inForcePremium)} = ${r4(averageCommissionRate)} = ${pct(averageCommissionRate)}`,
  ];
  return {
    value: { inForcePremium, inForceCount: inForce.length, activeAccounts, bookedCommission, averageCommissionRate },
    math: {
      inputs: { asOf, policies: policies.length },
      formula: "in force: effective ≤ as-of < expiry and status not lost/non-renewed; booked commission = Σ premium × rate; average rate = booked commission ÷ in-force premium",
      steps: { inForceIds: inForce.map((p) => p.id), lines },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Retention                                                           */
/* ------------------------------------------------------------------ */

export type Resolution = "renewed" | "lost" | "non_renewed" | "unresolved";

/** How a policy that has expired was resolved. An expired policy with no outcome is unresolved and counts as lost. */
export function resolutionOf(p: DashPolicy): Resolution {
  const s = p.outcome?.type ?? p.renewalStatus;
  if (s === "renewed") return "renewed";
  if (s === "lost") return "lost";
  if (s === "non_renewed") return "non_renewed";
  return "unresolved";
}

export interface LostRow {
  policyId: string;
  accountId: string;
  accountName: string;
  lineOfBusiness: LineOfBusiness;
  carrier: string;
  expiryDate: ISODate;
  expiringPremium: number;
  resolution: Exclude<Resolution, "renewed">;
  lostReason: LostReason | null;
  reason: string | null;
  competingPremium: number | null;
}

export interface Retention {
  resolvedCount: number;
  renewedCount: number;
  lostCount: number;
  nonRenewedCount: number;
  /** Expired with no outcome: counted as lost and flagged. */
  unresolvedCount: number;
  resolvedPremium: number;
  renewedExpiringPremium: number;
  successorPremium: number;
  /** Renewed policies whose successor policy is no longer on file (contributes $0 to successor premium). */
  successorsMissing: number;
  countRetention: number | null;
  premiumRetention: number | null;
  renewedPremiumRatio: number | null;
  /** Policies with an outcome that have not expired yet (expiry after the as-of date): left out until they expire. */
  excludedNotYetExpired: number;
  lostRows: LostRow[];
}

/**
 * Retention over policies whose expiry falls in the lookback window.
 *   count retention = renewed ÷ resolved
 *   premium retention = expiring premium of renewed ÷ expiring premium of resolved
 *   renewed premium ratio = successor premium of renewed ÷ expiring premium of resolved (can exceed 100%)
 * Resolved = renewed, lost, non-renewed, or expired with no outcome (treated as lost).
 */
export function retention(policies: DashPolicy[], accounts: DashAccount[], window: DateWindow, asOf: ISODate): Calc<Retention> {
  const byId = new Map(policies.map((p) => [p.id, p]));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  // Only policies that have expired by the as-of date can be resolved.
  const resolved = policies.filter((p) => inWindow(p.expiryDate, window) && p.expiryDate <= asOf);
  const excludedNotYetExpired = policies.filter((p) => resolutionOf(p) !== "unresolved" && p.expiryDate > asOf).length;

  const renewed = resolved.filter((p) => resolutionOf(p) === "renewed");
  const resolvedPremium = sumMoney(resolved.map((p) => p.annualPremium));
  const renewedExpiringPremium = sumMoney(renewed.map((p) => p.annualPremium));
  let successorsMissing = 0;
  const successorPremiums = renewed.map((p) => {
    const s = p.outcome?.successorPolicyId ? byId.get(p.outcome.successorPolicyId) : undefined;
    if (!s) {
      successorsMissing += 1;
      return 0;
    }
    return s.annualPremium;
  });
  const successorPremium = sumMoney(successorPremiums);

  const count = (r: Resolution) => resolved.filter((p) => resolutionOf(p) === r).length;
  const n = resolved.length;
  const countRetention = n > 0 ? renewed.length / n : null;
  const premiumRetention = resolvedPremium > 0 ? renewedExpiringPremium / resolvedPremium : null;
  const renewedPremiumRatio = resolvedPremium > 0 ? successorPremium / resolvedPremium : null;

  const lostRows: LostRow[] = resolved
    .filter((p) => resolutionOf(p) !== "renewed")
    .map((p) => ({
      policyId: p.id,
      accountId: p.accountId,
      accountName: accountName.get(p.accountId) ?? "Unknown account",
      lineOfBusiness: p.lineOfBusiness,
      carrier: p.carrier,
      expiryDate: p.expiryDate,
      expiringPremium: p.annualPremium,
      resolution: resolutionOf(p) as LostRow["resolution"],
      lostReason: p.outcome?.lostReason ?? null,
      reason: p.outcome?.reason ?? null,
      competingPremium: p.outcome?.competingPremium ?? null,
    }))
    .sort((a, b) => b.expiringPremium - a.expiringPremium);

  const lines = [
    `Window ${window.start} to ${window.end}: ${n} resolved (${renewed.length} renewed, ${count("lost")} lost, ${count("non_renewed")} non-renewed, ${count("unresolved")} unresolved treated as lost)`,
    `Excluded: ${excludedNotYetExpired} with an outcome but not yet expired`,
    countRetention === null ? "Count retention: no resolved policies" : `Count retention = ${renewed.length} ÷ ${n} = ${r4(countRetention)} = ${pct(countRetention)}`,
    `Renewed expiring premium = ${renewed.map((p) => usd(p.annualPremium)).join(" + ") || "$0"} = ${usd(renewedExpiringPremium)}`,
    `Resolved expiring premium = ${resolved.map((p) => usd(p.annualPremium)).join(" + ") || "$0"} = ${usd(resolvedPremium)}`,
    premiumRetention === null
      ? "Premium retention: no resolved premium"
      : `Premium retention = ${usd(renewedExpiringPremium)} ÷ ${usd(resolvedPremium)} = ${r4(premiumRetention)} = ${pct(premiumRetention)}`,
    `Successor premium = ${successorPremiums.map(usd).join(" + ") || "$0"} = ${usd(successorPremium)}${successorsMissing ? ` (${successorsMissing} successor missing, counted as $0)` : ""}`,
    renewedPremiumRatio === null
      ? "Renewed premium ratio: no resolved premium"
      : `Renewed premium ratio = ${usd(successorPremium)} ÷ ${usd(resolvedPremium)} = ${r4(renewedPremiumRatio)} = ${pct(renewedPremiumRatio)}`,
  ];

  return {
    value: {
      resolvedCount: n,
      renewedCount: renewed.length,
      lostCount: count("lost"),
      nonRenewedCount: count("non_renewed"),
      unresolvedCount: count("unresolved"),
      resolvedPremium,
      renewedExpiringPremium,
      successorPremium,
      successorsMissing,
      countRetention,
      premiumRetention,
      renewedPremiumRatio,
      excludedNotYetExpired,
      lostRows,
    },
    math: {
      inputs: { window, asOf, policies: policies.length },
      formula:
        "resolved = expiry in window and on/before as-of; count retention = renewed ÷ resolved; premium retention = renewed expiring premium ÷ resolved expiring premium; renewed premium ratio = successor premium ÷ resolved expiring premium",
      steps: { resolvedIds: resolved.map((p) => p.id), lines },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Expiring premium                                                    */
/* ------------------------------------------------------------------ */

/** Open = no outcome yet and status not started or in progress. */
export function isOpen(p: DashPolicy): boolean {
  return p.outcome === null && (p.renewalStatus === "not_started" || p.renewalStatus === "in_progress");
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface MonthBucket {
  /** YYYY-MM */
  month: string;
  label: string;
  count: number;
  premium: number;
}

/** Open policies expiring in the forward window, by calendar month (every month in the window, zeros included). */
export function expiringByMonth(policies: DashPolicy[], window: DateWindow): Calc<MonthBucket[]> {
  const open = policies.filter((p) => isOpen(p) && inWindow(p.expiryDate, window));
  const buckets: MonthBucket[] = [];
  let cursor = `${window.start.slice(0, 7)}-01`;
  const lastMonth = window.end.slice(0, 7);
  while (cursor.slice(0, 7) <= lastMonth) {
    const month = cursor.slice(0, 7);
    const inMonth = open.filter((p) => p.expiryDate.slice(0, 7) === month);
    buckets.push({
      month,
      label: `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`,
      count: inMonth.length,
      premium: sumMoney(inMonth.map((p) => p.annualPremium)),
    });
    cursor = addMonths(cursor, 1).value;
  }
  return {
    value: buckets,
    math: {
      inputs: { window, policies: policies.length },
      formula: "open policies (no outcome) with expiry in the window, grouped by expiry month; premium summed per month",
      steps: {
        openCount: open.length,
        lines: [
          `${open.length} open policies expire between ${window.start} and ${window.end}`,
          ...buckets.map((b) => `${b.label}: ${b.count} ${b.count === 1 ? "policy" : "policies"}, ${usd(b.premium)}`),
          `Total ${usd(sumMoney(buckets.map((b) => b.premium)))}`,
        ],
      },
    },
  };
}

export interface TopExpiringRow {
  policyId: string;
  accountId: string;
  accountName: string;
  lineOfBusiness: LineOfBusiness;
  carrier: string;
  expiryDate: ISODate;
  premium: number;
  daysToExpiry: number;
  readiness: Readiness;
}

/** The largest open policies expiring in the forward window, by premium (ties: sooner expiry first). */
export function topExpiring(policies: DashPolicy[], accounts: DashAccount[], window: DateWindow, asOf: ISODate, limit = 10): Calc<TopExpiringRow[]> {
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const rows = policies
    .filter((p) => isOpen(p) && inWindow(p.expiryDate, window))
    .map((p) => ({
      policyId: p.id,
      accountId: p.accountId,
      accountName: accountName.get(p.accountId) ?? "Unknown account",
      lineOfBusiness: p.lineOfBusiness,
      carrier: p.carrier,
      expiryDate: p.expiryDate,
      premium: p.annualPremium,
      daysToExpiry: daysBetween(asOf, p.expiryDate).value,
      readiness: checklistReadiness(p.checklist.done, p.checklist.total).value,
    }))
    .sort((a, b) => b.premium - a.premium || a.daysToExpiry - b.daysToExpiry)
    .slice(0, limit);
  return {
    value: rows,
    math: {
      inputs: { window, asOf, limit },
      formula: "open policies expiring in the window, largest premium first, first N",
      steps: { lines: rows.map((r, i) => `${i + 1}. ${r.accountName} ${r.lineOfBusiness}: ${usd(r.premium)}, ${r.daysToExpiry} days`) },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Revenue forecast                                                    */
/* ------------------------------------------------------------------ */

export interface ForecastAssumptions {
  /** 0–1, e.g. 0.875 */
  retention: number;
  /** e.g. 0.05 for +5%, −0.05 for −5% */
  rateChange: number;
}

export interface ForecastContribution {
  policyId: string;
  accountName: string;
  lineOfBusiness: LineOfBusiness;
  premium: number;
  commissionRate: number;
  commission: number;
}

export interface ForecastScenario {
  retention: number;
  rateChange: number;
  commission: number;
  contributions: ForecastContribution[];
}

export interface Forecast {
  policyCount: number;
  expiringPremium: number;
  base: ForecastScenario;
  low: ForecastScenario;
  high: ForecastScenario;
}

export const DEFAULT_RETENTION = 0.85;
const SPREAD_RETENTION = 0.1;
const SPREAD_RATE = 0.05;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * Forecast commission = Σ over open policies expiring in the window of
 * expiring premium × retention × (1 + rate change) × the policy's own commission rate.
 * Low: retention − 10 points and rate change − 5 points. High: the opposite.
 * Retention is kept within 0–100%, rate change no lower than −100%.
 */
export function revenueForecast(policies: DashPolicy[], accounts: DashAccount[], window: DateWindow, assumptions: ForecastAssumptions): Calc<Forecast> {
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const open = policies.filter((p) => isOpen(p) && inWindow(p.expiryDate, window)).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

  const scenario = (retentionRaw: number, rateRaw: number): ForecastScenario => {
    const r = clamp(retentionRaw, 0, 1);
    const rc = Math.max(rateRaw, -1);
    const contributions = open.map((p) => ({
      policyId: p.id,
      accountName: accountName.get(p.accountId) ?? "Unknown account",
      lineOfBusiness: p.lineOfBusiness,
      premium: p.annualPremium,
      commissionRate: p.commissionRate,
      commission: p.annualPremium * r * (1 + rc) * (p.commissionRate / 100),
    }));
    return { retention: r, rateChange: rc, commission: sumMoney(contributions.map((c) => c.commission)), contributions };
  };

  const base = scenario(assumptions.retention, assumptions.rateChange);
  const low = scenario(assumptions.retention - SPREAD_RETENTION, assumptions.rateChange - SPREAD_RATE);
  const high = scenario(assumptions.retention + SPREAD_RETENTION, assumptions.rateChange + SPREAD_RATE);

  const scenarioLine = (name: string, s: ForecastScenario) =>
    `${name}: retention ${pct(s.retention)}, rate change ${s.rateChange >= 0 ? "+" : ""}${pct(s.rateChange)} → ${usdCents(s.commission)}`;
  const lines = [
    `${open.length} open policies expire between ${window.start} and ${window.end}`,
    ...base.contributions.map(
      (c) =>
        `${c.accountName} ${c.lineOfBusiness}: ${usd(c.premium)} × ${r4(base.retention)} × (1 + ${r4(base.rateChange)}) × ${group(c.commissionRate, 3).replace(/\.?0+$/, "")}% = ${usdCents(c.commission)}`,
    ),
    scenarioLine("Base", base),
    scenarioLine("Low", low),
    scenarioLine("High", high),
  ];

  return {
    value: { policyCount: open.length, expiringPremium: sumMoney(open.map((p) => p.annualPremium)), base, low, high },
    math: {
      inputs: { window, assumptions },
      formula:
        "commission = Σ expiring premium × retention × (1 + rate change) × commission rate; low = retention − 10 pts, rate − 5 pts; high = retention + 10 pts (max 100%), rate + 5 pts",
      steps: { lines },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Concentration                                                       */
/* ------------------------------------------------------------------ */

export const CARRIER_FLAG_SHARE = 0.35;
export const ACCOUNT_FLAG_SHARE = 0.15;

export interface ShareRow {
  key: string;
  label: string;
  premium: number;
  share: number;
  flagged: boolean;
}

export interface Concentration {
  totalPremium: number;
  byCarrier: ShareRow[];
  byLine: ShareRow[];
  topAccounts: ShareRow[];
  flaggedCarriers: ShareRow[];
  flaggedAccounts: ShareRow[];
}

/** Share of in-force premium by carrier, line and account. Flags a carrier above 35% or an account above 15%. */
export function concentration(policies: DashPolicy[], accounts: DashAccount[], asOf: ISODate): Calc<Concentration> {
  const inForce = policies.filter((p) => isInForce(p, asOf));
  const total = sumMoney(inForce.map((p) => p.annualPremium));
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  const shares = (keyOf: (p: DashPolicy) => string, labelOf: (k: string) => string, threshold: number | null): ShareRow[] => {
    const sums = new Map<string, number[]>();
    for (const p of inForce) sums.set(keyOf(p), [...(sums.get(keyOf(p)) ?? []), p.annualPremium]);
    return [...sums.entries()]
      .map(([key, xs]) => {
        const premium = sumMoney(xs);
        const share = total > 0 ? premium / total : 0;
        return { key, label: labelOf(key), premium, share, flagged: threshold !== null && share > threshold };
      })
      .sort((a, b) => b.premium - a.premium || a.label.localeCompare(b.label));
  };

  const byCarrier = shares((p) => p.carrier, (k) => k, CARRIER_FLAG_SHARE);
  const byLine = shares((p) => p.lineOfBusiness, (k) => k, null);
  const allAccounts = shares((p) => p.accountId, (k) => accountName.get(k) ?? "Unknown account", ACCOUNT_FLAG_SHARE);
  const topAccounts = allAccounts.slice(0, 5);

  const line = (r: ShareRow) => `${r.label}: ${usd(r.premium)} ÷ ${usd(total)} = ${pct(r.share)}${r.flagged ? " (flagged)" : ""}`;
  return {
    value: {
      totalPremium: total,
      byCarrier,
      byLine,
      topAccounts,
      flaggedCarriers: byCarrier.filter((r) => r.flagged),
      flaggedAccounts: allAccounts.filter((r) => r.flagged),
    },
    math: {
      inputs: { asOf, inForce: inForce.length },
      formula: "share = group's in-force premium ÷ total in-force premium; flag a carrier above 35% or an account above 15%",
      steps: {
        lines: [`Total in-force premium = ${usd(total)}`, "By carrier:", ...byCarrier.map(line), "By line:", ...byLine.map(line), "Top accounts:", ...topAccounts.map(line)],
      },
    },
  };
}
