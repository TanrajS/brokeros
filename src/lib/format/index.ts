/**
 * Display formatting (not business logic). Every helper returns null for
 * missing input so the UI can render an em dash with a tooltip instead of
 * "NaN", "undefined" or a silent 0.
 */

const cad = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const cadCents = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 });

export function formatCurrency(amount: number | null | undefined, options: { cents?: boolean } = {}): string | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  return (options.cents ? cadCents : cad).format(amount);
}

export function formatInteger(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return integer.format(n);
}

export function formatPercent(ratePercent: number | null | undefined): string | null {
  if (ratePercent === null || ratePercent === undefined || !Number.isFinite(ratePercent)) return null;
  const text = Number.isInteger(ratePercent) ? String(ratePercent) : ratePercent.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return `${text}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Nov 2026" from "2026-11-12", without touching Date or time zones. */
export function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Human description of a day count relative to the as-of date. */
export function describeDays(days: number | null | undefined): string | null {
  if (days === null || days === undefined || !Number.isFinite(days)) return null;
  if (days === 0) return "today";
  if (days < 0) return `${formatInteger(-days)} ${-days === 1 ? "day" : "days"} ago`;
  return `in ${formatInteger(days)} ${days === 1 ? "day" : "days"}`;
}

export function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
