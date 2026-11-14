/**
 * Maps the demo book onto marketing inputs so tests can run the seed through
 * the comparison and market-log functions without a database. Pure.
 */
import { addDays } from "@/lib/domain/dates";
import type { ExpiringTerms, MarketSubmission, QuoteInput } from "@/lib/domain/marketing";
import type { ISODate } from "@/lib/domain/types";
import type { DemoAccount, DemoPolicy } from "./demoBookData";

export function demoExpiringTerms(p: DemoPolicy): ExpiringTerms {
  return {
    carrier: p.carrier,
    premium: p.annualPremium,
    exposureAmount: p.exposureAmount,
    exposureBasis: p.exposureBasis,
    occurrenceLimit: p.occurrenceLimit,
    aggregateLimit: p.aggregateLimit,
    deductible: p.deductible,
    endorsements: p.endorsements,
    commissionRate: p.commissionRate,
  };
}

export function demoQuotes(p: DemoPolicy, asOf: ISODate): QuoteInput[] {
  return p.submissions.flatMap((s, i) =>
    s.quotes.map((q, j) => ({
      id: `${i}-${j}`,
      carrier: s.carrier,
      premium: q.premium,
      occurrenceLimit: q.occurrenceLimit,
      aggregateLimit: q.aggregateLimit,
      deductible: q.deductible,
      endorsements: q.endorsements,
      commissionRate: q.commissionRate,
      exposureAmount: q.exposureAmount,
      validUntil: addDays(asOf, q.validUntilOffset).value,
      isIncumbent: q.incumbent,
    })),
  );
}

export function demoMarketSubmissions(book: DemoAccount[], asOf: ISODate): MarketSubmission[] {
  return book.flatMap((a) =>
    a.policies.flatMap((p) =>
      p.submissions.map((s, i) => ({
        id: `${p.key}-${i}`,
        carrier: s.carrier,
        sentOn: s.sentOffset === null ? null : addDays(asOf, s.sentOffset).value,
        respondedOn: s.respondedOffset === null ? null : addDays(asOf, s.respondedOffset).value,
        status: s.status,
        declineReason: s.declineReason,
        quoteCount: s.quotes.length,
      })),
    ),
  );
}
