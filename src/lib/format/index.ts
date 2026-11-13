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

/** "+8.0%", "−6.1%", "0.0%" from a ratio such as 0.08. Null for missing. */
export function formatSignedPercent(ratio: number | null | undefined, decimals = 1): string | null {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return null;
  const text = Math.abs(ratio * 100).toFixed(decimals);
  if (Number(text) === 0) return `${text}%`;
  return `${ratio > 0 ? "+" : "−"}${text}%`;
}

/** A premium rate in dollars with two decimals, e.g. "$4.70". */
export function formatRate(rate: number | null | undefined): string | null {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return null;
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(rate);
}

/** A ratio as a percentage with one decimal: 0.875 → "87.5%". Null for missing. */
export function formatRatioPercent(ratio: number | null | undefined): string | null {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return null;
  return `${(ratio * 100).toFixed(1)}%`;
}

const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-12" → "December 2026". Null when not a YYYY-MM string. */
export function formatMonth(yyyymm: string | null | undefined): string | null {
  if (!yyyymm || !/^\d{4}-\d{2}$/.test(yyyymm)) return null;
  const m = Number(yyyymm.slice(5, 7));
  if (m < 1 || m > 12) return null;
  return `${MONTH_LONG[m - 1]} ${yyyymm.slice(0, 4)}`;
}
