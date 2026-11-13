import type { Calc, ISODate } from "./types";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** True when the string is a real calendar date written as YYYY-MM-DD. */
export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string") return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return (
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === mo - 1 &&
    probe.getUTCDate() === d
  );
}

/** Whole days since 1970-01-01 for a YYYY-MM-DD string, computed in UTC so time zones never leak in. */
function dayNumber(date: ISODate): number {
  if (!isISODate(date)) {
    throw new Error(`Expected a YYYY-MM-DD date, received "${date}"`);
  }
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

/**
 * Whole calendar days from `asOf` to `date`. Positive when `date` is later,
 * negative when it is earlier, zero on the same day. Time zones are ignored.
 */
export function daysBetween(asOf: ISODate, date: ISODate): Calc<number> {
  const asOfDay = dayNumber(asOf);
  const dateDay = dayNumber(date);
  const value = dateDay - asOfDay;
  return {
    value,
    math: {
      inputs: { asOf, date },
      formula: "days = (day number of date) − (day number of asOf), where day number counts whole days since 1970-01-01 in UTC",
      steps: { asOfDayNumber: asOfDay, dateDayNumber: dateDay, days: value },
    },
  };
}

/** Adds (or subtracts, when negative) whole days to a YYYY-MM-DD date. */
export function addDays(date: ISODate, days: number): Calc<ISODate> {
  if (!Number.isInteger(days)) {
    throw new Error(`Expected a whole number of days, received ${days}`);
  }
  const start = dayNumber(date);
  const end = start + days;
  const value = new Date(end * MS_PER_DAY).toISOString().slice(0, 10);
  return {
    value,
    math: {
      inputs: { date, days },
      formula: "result = date shifted by `days` whole calendar days",
      steps: { startDayNumber: start, endDayNumber: end, result: value },
    },
  };
}

/** Expiry must be strictly after effective. */
export function isExpiryAfterEffective(effective: ISODate, expiry: ISODate): Calc<boolean> {
  const gap = daysBetween(effective, expiry);
  return {
    value: gap.value > 0,
    math: {
      inputs: { effective, expiry },
      formula: "valid when daysBetween(effective, expiry) > 0",
      steps: { daysBetween: gap.value },
    },
  };
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/**
 * Adds whole calendar months. When the target month is shorter, the day is
 * clamped to its last day (31 Jan + 1 month = 28 Feb; 29 Feb 2028 + 12 = 28 Feb 2029).
 */
export function addMonths(date: ISODate, months: number): Calc<ISODate> {
  if (!Number.isInteger(months)) throw new Error(`Expected a whole number of months, received ${months}`);
  if (!isISODate(date)) throw new Error(`Expected a YYYY-MM-DD date, received "${date}"`);
  const [y, m, d] = date.split("-").map(Number);
  const monthIndex = y * 12 + (m - 1) + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = (monthIndex % 12) + 1;
  const lastDay = daysInMonth(targetYear, targetMonth);
  const targetDay = Math.min(d, lastDay);
  const value = `${String(targetYear).padStart(4, "0")}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
  return {
    value,
    math: {
      inputs: { date, months },
      formula: "move the month forward by `months`; keep the day, clamped to the last day of the target month",
      steps: { targetYear, targetMonth, lastDayOfTargetMonth: lastDay, targetDay, result: value },
    },
  };
}
