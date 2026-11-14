/**
 * Marketing (v1.1): submission status rules, like-for-like quote comparison,
 * the normalise rule and the market log. Pure: no React, no database, no clock.
 * Every export returns { value, math }.
 */
import { ENDORSEMENTS, type DeclineReason, type Endorsement, type ExposureBasis, type SubmissionStatus } from "@/lib/constants";
import { daysBetween } from "./dates";
import { inWindow, type DateWindow } from "./dashboard";
import { rateUnit } from "./renewals";
import type { Calc, ISODate } from "./types";

function group(n: number, decimals: number): string {
  const [int, frac] = Math.abs(n).toFixed(decimals).split(".");
  return `${n < 0 ? "−" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ? "." + frac : ""}`;
}
const usd = (n: number) => `${n < 0 ? "−" : ""}$${group(Math.abs(n), 0)}`;
const usd2 = (n: number) => `${n < 0 ? "−" : ""}$${group(Math.abs(n), 2)}`;
const r4 = (n: number) => group(n, 4);
const pct = (ratio: number) => `${group(ratio * 100, 1)}%`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ------------------------------------------------------------------ */
/* Submission status rules                                             */
/* ------------------------------------------------------------------ */

export interface TransitionContext {
  /** The submission has a sent date on or before the as-of date. */
  hasSentOn: boolean;
  /** Quotes recorded against this submission. */
  quoteCount: number;
  /** Another submission on the same policy is already bound. */
  otherBound: boolean;
  /** The policy already has a renewal outcome recorded. */
  policyHasOutcome: boolean;
  /** The quote being bound is past its valid-until date. */
  quoteExpired: boolean;
}

/**
 * Allowed moves:
 *   planned → submitted (needs a sent date)
 *   submitted → quoted (only by recording a quote), declined, no_response
 *   quoted → bound (one per policy, quote not expired, no outcome yet), declined (carrier withdrew)
 *   no_response / declined → submitted (reopen)
 *   bound → quoted (unbind, only while the policy has no outcome)
 */
export function checkTransition(from: SubmissionStatus, to: SubmissionStatus, ctx: TransitionContext): Calc<{ allowed: boolean; reason: string | null }> {
  let reason: string | null = null;
  const allowedTargets: Record<SubmissionStatus, SubmissionStatus[]> = {
    planned: ["submitted"],
    submitted: ["quoted", "declined", "no_response"],
    quoted: ["bound", "declined"],
    declined: ["submitted"],
    no_response: ["submitted"],
    bound: ["quoted"],
  };
  if (from === to) reason = `Already ${to.replace("_", " ")}.`;
  else if (!allowedTargets[from].includes(to)) reason = `A ${from.replace("_", " ")} submission cannot move to ${to.replace("_", " ")}.`;
  else if (to === "submitted" && !ctx.hasSentOn) reason = "Enter the date it was sent (on or before the as-of date) first.";
  else if (from === "submitted" && to === "quoted" && ctx.quoteCount === 0) reason = "Record a quote; a submission becomes quoted when its first quote is entered.";
  else if (to === "bound" && ctx.otherBound) reason = "Another carrier is already bound on this policy. Unbind it first.";
  else if (to === "bound" && ctx.quoteExpired) reason = "This quote has expired. Ask the carrier to extend it before binding.";
  else if (to === "bound" && ctx.policyHasOutcome) reason = "The policy already has a renewal outcome. Undo it first to bind a different quote.";
  else if (from === "bound" && to === "quoted" && ctx.policyHasOutcome) reason = "The renewal outcome is recorded. Undo the outcome before unbinding.";
  return {
    value: { allowed: reason === null, reason },
    math: {
      inputs: { from, to, ...ctx },
      formula: "planned→submitted; submitted→quoted/declined/no response; quoted→bound/declined; declined or no response→submitted; bound→quoted",
      steps: { lines: [reason ?? `${from} → ${to} allowed`] },
    },
  };
}

/** Quotes can be recorded against a submission that has been sent: status submitted, or quoted for a further option. */
export function canRecordQuote(status: SubmissionStatus): Calc<{ allowed: boolean; reason: string | null }> {
  const allowed = status === "submitted" || status === "quoted";
  const reason = allowed ? null : `A quote can only be recorded against a submitted submission (this one is ${status.replace("_", " ")}).`;
  return { value: { allowed, reason }, math: { inputs: { status }, formula: "allowed when status is submitted (or quoted, for a further option)", steps: { lines: [reason ?? "allowed"] } } };
}

/** Days from sending to the carrier's response; for an outstanding submission, days waiting so far. */
export function daysToRespond(sentOn: ISODate | null, respondedOn: ISODate | null, status: SubmissionStatus, asOf: ISODate): Calc<{ days: number | null; waiting: boolean }> {
  let days: number | null = null;
  let waiting = false;
  let line = "not sent";
  if (sentOn && respondedOn) {
    days = daysBetween(sentOn, respondedOn).value;
    line = `responded: ${respondedOn} − ${sentOn} = ${days} days`;
  } else if (sentOn && (status === "submitted" || status === "no_response")) {
    days = daysBetween(sentOn, asOf).value;
    waiting = true;
    line = `waiting: ${asOf} − ${sentOn} = ${days} days`;
  }
  return { value: { days, waiting }, math: { inputs: { sentOn, respondedOn, status, asOf }, formula: "responded date − sent date; while outstanding, as-of date − sent date", steps: { lines: [line] } } };
}

export function isQuoteExpired(validUntil: ISODate, asOf: ISODate): Calc<boolean> {
  const value = validUntil < asOf;
  return { value, math: { inputs: { validUntil, asOf }, formula: "expired when valid-until is before the as-of date", steps: { lines: [`${validUntil} ${value ? "<" : "≥"} ${asOf}`] } } };
}

/* ------------------------------------------------------------------ */
/* Like-for-like comparison                                            */
/* ------------------------------------------------------------------ */

export interface ExpiringTerms {
  carrier: string;
  premium: number;
  exposureAmount: number | null;
  exposureBasis: ExposureBasis;
  occurrenceLimit: number | null;
  aggregateLimit: number | null;
  deductible: number | null;
  endorsements: Endorsement[];
  commissionRate: number;
}

export interface QuoteInput {
  id: string;
  carrier: string;
  premium: number;
  occurrenceLimit: number | null;
  aggregateLimit: number | null;
  deductible: number | null;
  endorsements: Endorsement[];
  commissionRate: number;
  /** Exposure the carrier rated on; null means the expiring exposure. */
  exposureAmount: number | null;
  validUntil: ISODate;
  isIncumbent: boolean;
}

/**
 * What a quote is compared against. From the expiring policy, every term must
 * be equal. From a contract requirement, limits must be at least the required
 * amount, required endorsements present, and the deductible is not specified.
 */
export interface TargetTerms {
  kind: "expiring" | "requirement";
  label: string;
  occurrenceLimit: number | null;
  aggregateLimit: number | null;
  /** Null with kind "requirement" means not specified (the term is skipped). */
  deductible: number | null;
  endorsements: Endorsement[];
}

export function targetFromExpiring(e: ExpiringTerms): TargetTerms {
  return { kind: "expiring", label: `Expiring terms (${e.carrier})`, occurrenceLimit: e.occurrenceLimit, aggregateLimit: e.aggregateLimit, deductible: e.deductible, endorsements: e.endorsements };
}

export function targetFromRequirement(r: { contractName: string; requiredOccurrence: number | null; requiredAggregate: number | null; requiredEndorsements: Endorsement[] }): TargetTerms {
  return { kind: "requirement", label: r.contractName, occurrenceLimit: r.requiredOccurrence, aggregateLimit: r.requiredAggregate, deductible: null, endorsements: r.requiredEndorsements };
}

export type TermKey = "occurrence" | "aggregate" | "deductible" | Endorsement;
export type TermDirection = "equal" | "better" | "worse" | "added" | "missing";

export interface TermComparison {
  term: TermKey;
  matches: boolean;
  direction: TermDirection;
  /** Quote minus target, for money terms. */
  difference: number | null;
  note: string;
}

export interface QuoteComparison {
  quote: QuoteInput;
  premiumChange: number | null;
  rate: number | null;
  rateChange: number | null;
  premiumPerMillion: number | null;
  commission: number;
  expired: boolean;
  terms: TermComparison[];
  termsMatched: number;
  termsCompared: number;
  mismatches: TermComparison[];
  /** Limits and deductible all match the target: kept in the Normalise view. */
  comparableOnLimits: boolean;
}

export interface QuoteComparisonResult {
  target: TargetTerms;
  expiringRate: number | null;
  expiringCommission: number;
  unitLabel: string;
  quotes: QuoteComparison[];
}

const MONEY_TERM_LABEL: Record<"occurrence" | "aggregate" | "deductible", string> = { occurrence: "Occurrence limit", aggregate: "Aggregate limit", deductible: "Deductible" };

function compareLimit(term: "occurrence" | "aggregate", quoteValue: number | null, target: number | null, kind: TargetTerms["kind"]): TermComparison | null {
  if (target === null) return null; // not specified: skipped
  const label = MONEY_TERM_LABEL[term];
  if (quoteValue === null) return { term, matches: false, direction: "worse", difference: null, note: `${label} not quoted (target ${usd(target)})` };
  const diff = round2(quoteValue - target);
  const direction: TermDirection = diff === 0 ? "equal" : diff > 0 ? "better" : "worse";
  const matches = kind === "expiring" ? diff === 0 : diff >= 0;
  const note = diff === 0 ? `${label} equal at ${usd(quoteValue)}` : `${label} ${diff > 0 ? "higher" : "lower"} by ${usd(Math.abs(diff))} (${usd(quoteValue)} vs ${usd(target)})`;
  return { term, matches, direction, difference: diff, note };
}

function compareDeductible(quoteValue: number | null, target: number | null, kind: TargetTerms["kind"]): TermComparison | null {
  if (kind === "requirement" && target === null) return null;
  const q = quoteValue ?? 0;
  const t = target ?? 0;
  const diff = round2(q - t);
  const direction: TermDirection = diff === 0 ? "equal" : diff > 0 ? "worse" : "better";
  const note = diff === 0 ? `Deductible equal at ${usd(q)}` : diff > 0 ? `Deductible higher by ${usd(diff)} (${usd(q)} vs ${usd(t)}): more retained risk` : `Deductible lower by ${usd(-diff)} (${usd(q)} vs ${usd(t)})`;
  return { term: "deductible", matches: diff === 0, direction, difference: diff, note };
}

const ENDORSEMENT_SHORT: Record<Endorsement, string> = {
  additional_insured: "Additional insured",
  waiver_of_subrogation: "Waiver of subrogation",
  primary_noncontributory: "Primary & non-contributory",
  notice_of_cancellation_30: "30-day notice of cancellation",
};

/**
 * Compares each quote with the expiring policy and the target terms.
 *   premium change = quoted premium ÷ expiring premium − 1
 *   rate = premium ÷ (exposure ÷ unit), unit as in v0.2; rate change = quote rate ÷ expiring rate − 1
 *   premium per $1M = premium ÷ occurrence limit × 1,000,000
 *   commission = quoted premium × the quote's commission rate
 * Terms: occurrence, aggregate, deductible and the four endorsements, each
 * matching or not; the count is "N of M terms match", never a single score.
 */
export function compareQuotes(expiring: ExpiringTerms, quotes: QuoteInput[], target: TargetTerms, asOf: ISODate): Calc<QuoteComparisonResult> {
  const unit = rateUnit(expiring.exposureBasis);
  const expiringRate = expiring.exposureAmount ? expiring.premium / (expiring.exposureAmount / unit.divisor) : null;
  const expiringCommission = round2(expiring.premium * (expiring.commissionRate / 100));
  const lines: string[] = [
    `Target: ${target.label}`,
    expiringRate === null ? "Expiring rate: exposure missing" : `Expiring rate = ${usd(expiring.premium)} ÷ (${usd(expiring.exposureAmount!)} ÷ ${group(unit.divisor, 0)}) = ${r4(expiringRate)} ${unit.label}`,
  ];

  const results = quotes.map((q): QuoteComparison => {
    const premiumChange = expiring.premium > 0 ? q.premium / expiring.premium - 1 : null;
    const exposure = q.exposureAmount ?? expiring.exposureAmount;
    const rate = exposure ? q.premium / (exposure / unit.divisor) : null;
    const rateChange = rate !== null && expiringRate ? rate / expiringRate - 1 : null;
    const premiumPerMillion = q.occurrenceLimit ? round2((q.premium / q.occurrenceLimit) * 1_000_000) : null;
    const commission = round2(q.premium * (q.commissionRate / 100));
    const expired = isQuoteExpired(q.validUntil, asOf).value;

    const terms: TermComparison[] = [];
    const occ = compareLimit("occurrence", q.occurrenceLimit, target.occurrenceLimit, target.kind);
    const agg = compareLimit("aggregate", q.aggregateLimit, target.aggregateLimit, target.kind);
    const ded = compareDeductible(q.deductible, target.deductible, target.kind);
    for (const t of [occ, agg, ded]) if (t) terms.push(t);
    for (const e of ENDORSEMENTS) {
      const wanted = target.endorsements.includes(e);
      const has = q.endorsements.includes(e);
      if (target.kind === "requirement" && !wanted) continue; // a requirement only specifies what it lists
      if (wanted && has) terms.push({ term: e, matches: true, direction: "equal", difference: null, note: `${ENDORSEMENT_SHORT[e]} included` });
      else if (wanted && !has) terms.push({ term: e, matches: false, direction: "missing", difference: null, note: `${ENDORSEMENT_SHORT[e]} missing` });
      else if (!wanted && has) terms.push({ term: e, matches: false, direction: "added", difference: null, note: `${ENDORSEMENT_SHORT[e]} added (not in the target)` });
      else terms.push({ term: e, matches: true, direction: "equal", difference: null, note: `${ENDORSEMENT_SHORT[e]} not included, as in the target` });
    }
    const mismatches = terms.filter((t) => !t.matches);
    const comparableOnLimits = terms.filter((t) => t.term === "occurrence" || t.term === "aggregate" || t.term === "deductible").every((t) => t.matches);

    lines.push(
      `${q.carrier}: premium change ${premiumChange === null ? "—" : `${usd(q.premium)} ÷ ${usd(expiring.premium)} − 1 = ${r4(premiumChange)}`}; ` +
        `rate ${rate === null ? "—" : `${usd(q.premium)} ÷ (${usd(exposure!)} ÷ ${group(unit.divisor, 0)}) = ${r4(rate)}`}` +
        (rateChange !== null ? `, change ${r4(rate!)} ÷ ${r4(expiringRate!)} − 1 = ${r4(rateChange)}` : "") +
        `; per $1M ${premiumPerMillion === null ? "—" : usd2(premiumPerMillion)}; commission ${usd(q.premium)} × ${q.commissionRate}% = ${usd2(commission)}; ` +
        `${terms.length - mismatches.length} of ${terms.length} terms match${mismatches.length ? ` (${mismatches.map((m) => m.note).join("; ")})` : ""}`,
    );
    return { quote: q, premiumChange, rate, rateChange, premiumPerMillion, commission, expired, terms, termsMatched: terms.length - mismatches.length, termsCompared: terms.length, mismatches, comparableOnLimits };
  });

  return {
    value: { target, expiringRate, expiringCommission, unitLabel: unit.label, quotes: results },
    math: {
      inputs: { expiringPremium: expiring.premium, quotes: quotes.length, target: target.label, asOf },
      formula:
        "premium change = quote ÷ expiring − 1; rate = premium ÷ exposure units; commission = premium × rate; a term matches when equal to the expiring term, or for a contract requirement when it meets it",
      steps: { lines },
    },
  };
}

export interface NormalisedView {
  included: QuoteComparison[];
  excluded: { comparison: QuoteComparison; reasons: string[] }[];
  /** Cheapest included quote's premium, for "price-only" differences. */
  cheapest: number | null;
}

/**
 * Normalise: keep only quotes whose limits and deductible match the target, so
 * the remaining differences are price. Endorsement differences stay visible but
 * do not exclude a quote.
 */
export function normaliseQuotes(comparisons: QuoteComparison[]): Calc<NormalisedView> {
  const included = comparisons.filter((c) => c.comparableOnLimits);
  const excluded = comparisons
    .filter((c) => !c.comparableOnLimits)
    .map((c) => ({ comparison: c, reasons: c.mismatches.filter((m) => m.term === "occurrence" || m.term === "aggregate" || m.term === "deductible").map((m) => m.note) }));
  const cheapest = included.length ? Math.min(...included.map((c) => c.quote.premium)) : null;
  return {
    value: { included, excluded, cheapest },
    math: {
      inputs: { quotes: comparisons.length },
      formula: "include a quote only when its occurrence limit, aggregate limit and deductible all match the target",
      steps: {
        lines: [
          `${included.length} of ${comparisons.length} quotes are comparable on limits and deductible`,
          ...excluded.map((x) => `Excluded ${x.comparison.quote.carrier}: ${x.reasons.join("; ")}`),
          ...included.map((c) => `${c.quote.carrier}: ${usd(c.quote.premium)}${cheapest !== null && c.quote.premium > cheapest ? ` (${usd(c.quote.premium - cheapest)} above the lowest comparable)` : ""}`),
        ],
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Market log                                                          */
/* ------------------------------------------------------------------ */

export interface MarketSubmission {
  id: string;
  carrier: string;
  sentOn: ISODate | null;
  respondedOn: ISODate | null;
  status: SubmissionStatus;
  declineReason: DeclineReason | null;
  quoteCount: number;
}

export interface CarrierLog {
  carrier: string;
  submissions: number;
  quotes: number;
  binds: number;
  declines: Partial<Record<DeclineReason, number>>;
  declineCount: number;
  hitRatio: number | null;
  bindRatio: number | null;
  medianDaysToRespond: number | null;
  /** Three or more submissions and no quotes. */
  flagged: boolean;
}

export const FLAG_MIN_SUBMISSIONS = 3;

export function median(xs: number[]): Calc<number | null> {
  const sorted = [...xs].sort((a, b) => a - b);
  const n = sorted.length;
  const value = n === 0 ? null : n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { value, math: { inputs: { xs }, formula: "middle value of the sorted list; the mean of the two middle values when the count is even", steps: { lines: [`sorted ${sorted.join(", ") || "(none)"} → ${value ?? "—"}`] } } };
}

/**
 * Per carrier, over submissions sent within the window:
 *   hit ratio = quotes ÷ submissions (a submission with at least one quote counts once)
 *   bind ratio = binds ÷ quotes
 *   median days to respond, over submissions with a response date.
 * Flags a carrier with three or more submissions and no quotes.
 */
export function marketLog(submissions: MarketSubmission[], window: DateWindow): Calc<{ carriers: CarrierLog[]; total: CarrierLog }> {
  const sent = submissions.filter((s) => s.status !== "planned" && s.sentOn !== null && inWindow(s.sentOn, window));
  const lines: string[] = [`${sent.length} submissions sent between ${window.start} and ${window.end}`];

  const summarise = (carrier: string, list: MarketSubmission[]): CarrierLog => {
    const quotes = list.filter((s) => s.quoteCount > 0).length;
    const binds = list.filter((s) => s.status === "bound").length;
    const declines: Partial<Record<DeclineReason, number>> = {};
    for (const s of list) if (s.status === "declined") declines[s.declineReason ?? "other"] = (declines[s.declineReason ?? "other"] ?? 0) + 1;
    const declineCount = list.filter((s) => s.status === "declined").length;
    const responseDays = list.filter((s) => s.sentOn && s.respondedOn).map((s) => daysBetween(s.sentOn!, s.respondedOn!).value);
    const med = median(responseDays).value;
    const hitRatio = list.length > 0 ? quotes / list.length : null;
    const bindRatio = quotes > 0 ? binds / quotes : null;
    return { carrier, submissions: list.length, quotes, binds, declines, declineCount, hitRatio, bindRatio, medianDaysToRespond: med, flagged: list.length >= FLAG_MIN_SUBMISSIONS && quotes === 0 };
  };

  const carriers = [...new Set(sent.map((s) => s.carrier))]
    .map((c) => summarise(c, sent.filter((s) => s.carrier === c)))
    .sort((a, b) => b.submissions - a.submissions || a.carrier.localeCompare(b.carrier));
  for (const c of carriers) {
    lines.push(
      `${c.carrier}: ${c.submissions} sent, ${c.quotes} quoted, ${c.binds} bound, ${c.declineCount} declined; ` +
        `hit ${c.hitRatio === null ? "—" : `${c.quotes} ÷ ${c.submissions} = ${r4(c.hitRatio)}`}; bind ${c.bindRatio === null ? "— (no quotes)" : `${c.binds} ÷ ${c.quotes} = ${r4(c.bindRatio)}`}; ` +
        `median ${c.medianDaysToRespond === null ? "—" : `${c.medianDaysToRespond} days`}${c.flagged ? " — flagged: 3+ submissions, no quotes" : ""}`,
    );
  }
  const total = summarise("All carriers", sent);
  lines.push(`Total: hit ${total.hitRatio === null ? "—" : pct(total.hitRatio)}, bind ${total.bindRatio === null ? "—" : pct(total.bindRatio)}`);
  return { value: { carriers, total: { ...total, flagged: false } }, math: { inputs: { submissions: submissions.length, window }, formula: "hit ratio = quotes ÷ submissions; bind ratio = binds ÷ quotes; median days = middle response time", steps: { lines } } };
}
