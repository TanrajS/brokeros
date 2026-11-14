import { describe, expect, it } from "vitest";
import { lookbackWindow } from "../dashboard";
import {
  canRecordQuote,
  checkTransition,
  compareQuotes,
  daysToRespond,
  isQuoteExpired,
  marketLog,
  median,
  normaliseQuotes,
  targetFromExpiring,
  targetFromRequirement,
  type ExpiringTerms,
  type MarketSubmission,
  type QuoteInput,
  type TransitionContext,
} from "../marketing";

const asOf = "2026-11-12";
const M = 1_000_000;
const ctx: TransitionContext = { hasSentOn: true, quoteCount: 0, otherBound: false, policyHasOutcome: false, quoteExpired: false };

describe("checkTransition", () => {
  it("allows the normal path", () => {
    expect(checkTransition("planned", "submitted", ctx).value.allowed).toBe(true);
    expect(checkTransition("submitted", "declined", ctx).value.allowed).toBe(true);
    expect(checkTransition("submitted", "quoted", { ...ctx, quoteCount: 1 }).value.allowed).toBe(true);
    expect(checkTransition("quoted", "bound", { ...ctx, quoteCount: 1 }).value.allowed).toBe(true);
    expect(checkTransition("no_response", "submitted", ctx).value.allowed).toBe(true);
  });
  it("blocks out-of-order and guarded moves", () => {
    expect(checkTransition("planned", "quoted", ctx).value.allowed).toBe(false);
    expect(checkTransition("planned", "submitted", { ...ctx, hasSentOn: false }).value.reason).toMatch(/date it was sent/);
    expect(checkTransition("submitted", "quoted", ctx).value.reason).toMatch(/Record a quote/);
    expect(checkTransition("quoted", "bound", { ...ctx, otherBound: true }).value.reason).toMatch(/already bound/);
    expect(checkTransition("quoted", "bound", { ...ctx, quoteExpired: true }).value.reason).toMatch(/expired/);
    expect(checkTransition("quoted", "bound", { ...ctx, policyHasOutcome: true }).value.allowed).toBe(false);
    expect(checkTransition("bound", "quoted", { ...ctx, policyHasOutcome: true }).value.reason).toMatch(/Undo the outcome/);
    expect(checkTransition("declined", "bound", ctx).value.allowed).toBe(false);
  });
  it("records quotes only against sent submissions", () => {
    expect([canRecordQuote("submitted").value.allowed, canRecordQuote("quoted").value.allowed]).toEqual([true, true]);
    expect([canRecordQuote("planned").value.allowed, canRecordQuote("declined").value.allowed, canRecordQuote("bound").value.allowed]).toEqual([false, false, false]);
  });
});

describe("daysToRespond and expiry", () => {
  it("counts response days or days waiting", () => {
    // 2026-10-13 → 2026-10-31 = 18 days
    expect(daysToRespond("2026-10-13", "2026-10-31", "quoted", asOf).value).toEqual({ days: 18, waiting: false });
    // sent 2026-10-29, still out at 2026-11-12 → 14 days waiting
    expect(daysToRespond("2026-10-29", null, "submitted", asOf).value).toEqual({ days: 14, waiting: true });
    expect(daysToRespond(null, null, "planned", asOf).value).toEqual({ days: null, waiting: false });
  });
  it("flags a quote valid until before the as-of date", () => {
    expect(isQuoteExpired("2026-11-11", asOf).value).toBe(true);
    expect(isQuoteExpired("2026-11-12", asOf).value).toBe(false); // valid through the as-of date
  });
});

const expiring: ExpiringTerms = {
  carrier: "Dominion Shield Insurance",
  premium: 150_000,
  exposureAmount: 25 * M,
  exposureBasis: "revenue",
  occurrenceLimit: 1 * M,
  aggregateLimit: 2 * M,
  deductible: 10_000,
  endorsements: ["additional_insured", "waiver_of_subrogation", "primary_noncontributory"],
  commissionRate: 12.5,
};
const quote = (id: string, over: Partial<QuoteInput>): QuoteInput => ({
  id,
  carrier: id,
  premium: 150_000,
  occurrenceLimit: 1 * M,
  aggregateLimit: 2 * M,
  deductible: 10_000,
  endorsements: ["additional_insured", "waiver_of_subrogation", "primary_noncontributory"],
  commissionRate: 12.5,
  exposureAmount: null,
  validUntil: "2026-12-31",
  isIncumbent: false,
  ...over,
});

describe("compareQuotes", () => {
  const quotes = [
    quote("Pacific Crest", { premium: 142_000, commissionRate: 15 }),
    quote("Ironwood", { premium: 128_000, deductible: 25_000, endorsements: ["additional_insured", "primary_noncontributory"], commissionRate: 10 }),
    quote("Higher limit", { premium: 160_000, occurrenceLimit: 2 * M, aggregateLimit: 4 * M, exposureAmount: 26 * M, endorsements: [...expiring.endorsements, "notice_of_cancellation_30"] }),
  ];
  const r = compareQuotes(expiring, quotes, targetFromExpiring(expiring), asOf).value;
  const [pc, iw, hl] = r.quotes;

  it("computes premium change, rate, per $1M and commission", () => {
    // 142,000 ÷ 150,000 − 1 = −0.053333
    expect(Number(pc.premiumChange!.toFixed(4))).toBe(-0.0533);
    // 128,000 ÷ 150,000 − 1 = −0.146667
    expect(Number(iw.premiumChange!.toFixed(4))).toBe(-0.1467);
    // expiring rate 150,000 ÷ 25,000 = 6.00 per $1,000; Pacific Crest 142,000 ÷ 25,000 = 5.68 → 5.68 ÷ 6 − 1 = −0.053333
    expect(r.expiringRate).toBe(6);
    expect(pc.rate).toBe(5.68);
    expect(Number(pc.rateChange!.toFixed(4))).toBe(-0.0533);
    // rated on 26M: 160,000 ÷ 26,000 = 6.153846 → ÷ 6 − 1 = 0.025641
    expect(Number(hl.rateChange!.toFixed(6))).toBe(0.025641);
    // per $1M: 142,000 ÷ 1M × 1M = 142,000; 160,000 ÷ 2M × 1M = 80,000
    expect([pc.premiumPerMillion, hl.premiumPerMillion]).toEqual([142_000, 80_000]);
    // commission: 142,000 × 15% = 21,300; 128,000 × 10% = 12,800; expiring 150,000 × 12.5% = 18,750
    expect([pc.commission, iw.commission, r.expiringCommission]).toEqual([21_300, 12_800, 18_750]);
  });

  it("counts terms that match and lists the mismatches", () => {
    // 3 money terms + 4 endorsements = 7
    expect([pc.termsMatched, pc.termsCompared]).toEqual([7, 7]);
    // Ironwood: deductible 25,000 vs 10,000 and waiver missing → 5 of 7
    expect([iw.termsMatched, iw.termsCompared]).toEqual([5, 7]);
    expect(iw.mismatches.map((m) => [m.term, m.direction, m.difference])).toEqual([
      ["deductible", "worse", 15_000],
      ["waiver_of_subrogation", "missing", null],
    ]);
    expect(iw.mismatches[0].note).toMatch(/more retained risk/);
    // Higher limit: occurrence +1M, aggregate +2M (better, but not equal), notice added → 4 of 7
    expect(hl.mismatches.map((m) => [m.term, m.direction])).toEqual([
      ["occurrence", "better"],
      ["aggregate", "better"],
      ["notice_of_cancellation_30", "added"],
    ]);
  });

  it("normalises to quotes matching on limits and deductible", () => {
    const n = normaliseQuotes(r.quotes).value;
    expect(n.included.map((c) => c.quote.id)).toEqual(["Pacific Crest"]);
    expect(n.excluded.map((x) => x.comparison.quote.id)).toEqual(["Ironwood", "Higher limit"]);
    expect(n.excluded[0].reasons).toEqual(["Deductible higher by $15,000 ($25,000 vs $10,000): more retained risk"]);
    expect(n.cheapest).toBe(142_000);
  });

  it("compares against a contract requirement on a meets basis", () => {
    const target = targetFromRequirement({ contractName: "Supply agreement", requiredOccurrence: 2 * M, requiredAggregate: 4 * M, requiredEndorsements: ["additional_insured", "waiver_of_subrogation"] });
    const rr = compareQuotes(expiring, quotes, target, asOf).value;
    // deductible not specified; endorsements: only the 2 required → 2 limits + 2 = 4 terms
    expect(rr.quotes.map((c) => [c.termsMatched, c.termsCompared])).toEqual([
      [2, 4], // Pacific Crest: limits 1M/2M below 2M/4M; both endorsements present
      [1, 4], // Ironwood: limits short, waiver missing
      [4, 4], // Higher limit: 2M/4M meets; both present
    ]);
    expect(normaliseQuotes(rr.quotes).value.included.map((c) => c.quote.id)).toEqual(["Higher limit"]);
  });

  it("flags expired quotes", () => {
    const e = compareQuotes(expiring, [quote("Old", { validUntil: "2026-11-01" })], targetFromExpiring(expiring), asOf).value;
    expect(e.quotes[0].expired).toBe(true);
  });
});

describe("marketLog", () => {
  const window = lookbackWindow(asOf, 12).value; // 2025-11-13 to 2026-11-12
  const sub = (id: string, carrier: string, over: Partial<MarketSubmission>): MarketSubmission => ({
    id,
    carrier,
    sentOn: "2026-06-01",
    respondedOn: null,
    status: "submitted",
    declineReason: null,
    quoteCount: 0,
    ...over,
  });

  it("matches the specified ratios: 5 submissions, 3 quotes, 1 bind", () => {
    const r = marketLog(
      [
        sub("a", "Northgate", { status: "bound", quoteCount: 1, respondedOn: "2026-06-11" }), // 10 days
        sub("b", "Northgate", { status: "quoted", quoteCount: 2, respondedOn: "2026-06-21" }), // 20 days; two options count once
        sub("c", "Northgate", { status: "quoted", quoteCount: 1, respondedOn: "2026-06-16" }), // 15 days
        sub("d", "Northgate", { status: "declined", declineReason: "capacity", respondedOn: "2026-06-06" }), // 5 days
        sub("e", "Northgate", { status: "no_response" }),
        sub("planned", "Northgate", { status: "planned", sentOn: null }), // not sent: excluded
        sub("old", "Northgate", { sentOn: "2025-11-12" }), // one day before the window: excluded
      ],
      window,
    ).value;
    const n = r.carriers[0];
    expect([n.submissions, n.quotes, n.binds, n.declineCount]).toEqual([5, 3, 1, 1]);
    // hit = 3 ÷ 5 = 0.60; bind = 1 ÷ 3 = 0.3333
    expect(n.hitRatio).toBe(0.6);
    expect(Number(n.bindRatio!.toFixed(4))).toBe(0.3333);
    // response days 10, 20, 15, 5 → sorted 5, 10, 15, 20 → (10 + 15) ÷ 2 = 12.5
    expect(n.medianDaysToRespond).toBe(12.5);
    expect(n.declines).toEqual({ capacity: 1 });
    expect(n.flagged).toBe(false);
  });

  it("flags three or more submissions with no quotes, and avoids division by zero", () => {
    const r = marketLog(
      [sub("1", "Maplewood", { status: "declined", declineReason: "class_of_business" }), sub("2", "Maplewood", { status: "no_response" }), sub("3", "Maplewood", {})],
      window,
    ).value;
    expect(r.carriers[0].flagged).toBe(true);
    expect([r.carriers[0].hitRatio, r.carriers[0].bindRatio]).toEqual([0, null]);
    expect(marketLog([], window).value.total.hitRatio).toBeNull();
  });

  it("takes the median of an odd list", () => {
    // 3, 9, 14 → 9
    expect(median([14, 3, 9]).value).toBe(9);
    expect(median([]).value).toBeNull();
  });
});
