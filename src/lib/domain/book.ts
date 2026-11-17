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

/* ------------------------------------------------------------------ */
/* Names (v1.5.1)                                                      */
/* ------------------------------------------------------------------ */

/** Account names must be unique within a workspace, case-insensitive and ignoring surrounding whitespace. The same rule applies to policy numbers within an account. */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** The existing name `candidate` collides with, if any; `excludeId` skips the row being edited. */
export function nameConflict(candidate: string, existing: { id: string; name: string }[], excludeId: string | null = null): Calc<{ id: string; name: string } | null> {
  const key = normalizeName(candidate);
  const hit = key === "" ? null : (existing.find((e) => e.id !== excludeId && normalizeName(e.name) === key) ?? null);
  return {
    value: hit,
    math: { inputs: { candidate, existing: existing.length, excludeId }, formula: "conflict when lower(trim(candidate)) equals lower(trim(an existing name)) on another row", steps: { lines: [hit ? `"${candidate}" matches "${hit.name}" (${hit.id})` : `"${candidate}" is free`] } },
  };
}

/** Demo accounts retired in v1.4; the prune script and Settings action remove seed accounts whose name starts with one of these words. */
export const RETIRED_DEMO_ACCOUNT_PREFIXES = ["Ashgrove", "Kestrel", "Prairie", "Bluewater", "Copperfield", "Maple", "Tidewater"] as const;

/** True when the name starts with one of the retired demo prefixes (whole first word, case-insensitive). "Maplewood …" does not match "Maple". */
export function isRetiredDemoAccountName(name: string): boolean {
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return RETIRED_DEMO_ACCOUNT_PREFIXES.some((p) => p.toLowerCase() === first);
}
