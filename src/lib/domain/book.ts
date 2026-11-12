import { daysBetween } from "./dates";
import type { Calc, ISODate } from "./types";

export interface NextExpiry {
  /** The expiry date chosen, or null when there are no policies. */
  date: ISODate | null;
  /** Days from asOf to that date (negative when already expired), or null. */
  days: number | null;
}

/**
 * The "next expiry" for an account: the earliest expiry on or after the as-of
 * date. When every policy has already expired, the most recently expired date is
 * used so the book still shows how overdue the account is.
 */
export function nextExpiry(asOf: ISODate, expiryDates: ISODate[]): Calc<NextExpiry> {
  const withDays = expiryDates.map((date) => ({ date, days: daysBetween(asOf, date).value }));
  const upcoming = withDays.filter((d) => d.days >= 0).sort((a, b) => a.days - b.days);
  const expired = withDays.filter((d) => d.days < 0).sort((a, b) => b.days - a.days);
  const chosen = upcoming[0] ?? expired[0] ?? null;
  return {
    value: { date: chosen?.date ?? null, days: chosen?.days ?? null },
    math: {
      inputs: { asOf, expiryDates },
      formula: "earliest expiry with days ≥ 0; otherwise the expired date closest to asOf; null when no policies",
      steps: { daysPerPolicy: withDays, upcoming, expired, chosen },
    },
  };
}
