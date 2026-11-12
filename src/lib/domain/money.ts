import type { Calc, CalcResult } from "./types";

/** Rounds to cents using half-up on the cents value, avoiding binary float drift. */
function roundToCents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Compact dollar format used for limits: $1M, $500K, $2.5M, $750, never NaN.
 * Up to two decimals, trailing zeros stripped.
 */
export function formatCompactDollars(amount: number): Calc<string> {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Expected a non-negative finite amount, received ${amount}`);
  }
  let unit: "M" | "K" | "" = "";
  let divisor = 1;
  if (amount >= 1_000_000) {
    unit = "M";
    divisor = 1_000_000;
  } else if (amount >= 1_000) {
    unit = "K";
    divisor = 1_000;
  }
  const scaled = amount / divisor;
  const rounded = Math.round(scaled * 100) / 100;
  const text = rounded.toString();
  const value = `$${text}${unit}`;
  return {
    value,
    math: {
      inputs: { amount },
      formula: "pick M for ≥ 1,000,000 or K for ≥ 1,000; divide; round to 2 decimals; strip trailing zeros; prefix $",
      steps: { unit, divisor, scaled, rounded, value },
    },
  };
}

/**
 * "$1M / $2M" style limit label. A missing side renders as an em dash so the
 * caller can still show the other side; `math.steps.missing` names what is absent.
 */
export function formatLimit(
  occurrence: number | null | undefined,
  aggregate: number | null | undefined,
): Calc<string> {
  const missing: string[] = [];
  const occ = occurrence == null ? null : formatCompactDollars(occurrence).value;
  const agg = aggregate == null ? null : formatCompactDollars(aggregate).value;
  if (occ == null) missing.push("occurrence limit");
  if (agg == null) missing.push("aggregate limit");
  const value = `${occ ?? "—"} / ${agg ?? "—"}`;
  return {
    value,
    math: {
      inputs: { occurrence, aggregate },
      formula: "formatCompactDollars(occurrence) + \" / \" + formatCompactDollars(aggregate)",
      steps: { occurrence: occ, aggregate: agg, missing, value },
    },
  };
}

/**
 * Parses a currency text input such as "48,000", "$48,000.50" or "48000".
 * Rejects negatives, blanks and anything that is not a plain number.
 */
export function parseCurrencyInput(raw: string): CalcResult<number> {
  const inputs = { raw };
  const trimmed = raw.trim();
  const stripped = trimmed.replace(/^\$/, "").replace(/[,\s]/g, "");
  const formula = "strip leading $, commas and spaces; accept only digits with an optional decimal part; reject negatives";
  if (stripped === "") {
    return { value: null, error: "Enter an amount", math: { inputs, formula, steps: { trimmed, stripped } } };
  }
  if (stripped.startsWith("-") || trimmed.startsWith("(")) {
    return { value: null, error: "Amount cannot be negative", math: { inputs, formula, steps: { trimmed, stripped } } };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(stripped)) {
    return { value: null, error: "Enter a number such as 48,000 or 48000.50", math: { inputs, formula, steps: { trimmed, stripped } } };
  }
  const parsed = Number(stripped);
  const value = roundToCents(parsed);
  return { value, error: null, math: { inputs, formula, steps: { trimmed, stripped, parsed, value } } };
}

/** Commission in dollars from an annual premium and a rate given in percent (15 means 15%). */
export function commissionAmount(premium: number, ratePercent: number): Calc<number> {
  if (!Number.isFinite(premium) || premium < 0) {
    throw new Error(`Expected a non-negative premium, received ${premium}`);
  }
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) {
    throw new Error(`Expected a rate between 0 and 100, received ${ratePercent}`);
  }
  const rateFraction = ratePercent / 100;
  const unrounded = premium * rateFraction;
  const value = roundToCents(unrounded);
  return {
    value,
    math: {
      inputs: { premium, ratePercent },
      formula: "commission = premium × (ratePercent ÷ 100), rounded to cents",
      steps: { rateFraction, unrounded, value },
    },
  };
}

/** Sum of amounts, rounded to cents. Empty input sums to 0 and says so. */
export function sumAmounts(amounts: number[]): Calc<number> {
  const running: number[] = [];
  let total = 0;
  for (const a of amounts) {
    if (!Number.isFinite(a)) throw new Error(`Expected finite amounts, received ${a}`);
    total += a;
    running.push(roundToCents(total));
  }
  const value = roundToCents(total);
  return {
    value,
    math: {
      inputs: { amounts },
      formula: "total = a1 + a2 + … + an, rounded to cents",
      steps: { count: amounts.length, runningTotals: running, value },
    },
  };
}
