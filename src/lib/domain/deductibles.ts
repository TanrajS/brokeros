/**
 * Deductible schedules (v1.3). A policy carries one default (all other perils)
 * deductible, mirrored in `policies.deductible`, plus rules for named perils or
 * coverage parts. Pure: no React, no database, no clock.
 */
import type { Calc } from "./types";

export const DEDUCTIBLE_KINDS = ["flat", "percent_of_loss", "percent_of_value", "waiting_period"] as const;
export type DeductibleKind = (typeof DEDUCTIBLE_KINDS)[number];
export const DEDUCTIBLE_KIND_LABELS: Record<DeductibleKind, string> = {
  flat: "Flat amount",
  percent_of_loss: "Percent of loss",
  percent_of_value: "Percent of value at risk",
  waiting_period: "Waiting period",
};

/** The peril every claim carries unless told otherwise; matches the default rule. */
export const DEFAULT_PERIL = "All other perils";

export interface DeductibleRule {
  id?: string;
  /** Peril or coverage part, e.g. Earthquake, Flood, Stock; matched to a claim's peril case-insensitively. */
  appliesTo: string;
  kind: DeductibleKind;
  amount: number | null;
  /** Percent, 0–100. */
  percent: number | null;
  minimum: number | null;
  maximum: number | null;
  hours: number | null;
  notes?: string | null;
  isDefault: boolean;
}

function group(n: number, decimals: number): string {
  const [int, frac] = Math.abs(n).toFixed(decimals).split(".");
  return `${n < 0 ? "−" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ? "." + frac : ""}`;
}
const usd = (n: number) => `$${group(n, 0)}`;
const usd2 = (n: number) => `$${group(n, 2)}`;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const norm = (s: string) => s.trim().toLowerCase();

/** A flat rule for a bare deductible amount (the policy's default when no schedule row exists). */
export function flatRule(amount: number, appliesTo = DEFAULT_PERIL, isDefault = true): DeductibleRule {
  return { appliesTo, kind: "flat", amount, percent: null, minimum: null, maximum: null, hours: null, isDefault };
}

/** One line describing a rule, e.g. "Earthquake: 10% of loss, minimum $100,000". */
export function describeRule(r: DeductibleRule): string {
  const bounds = [r.minimum !== null ? `minimum ${usd(r.minimum)}` : null, r.maximum !== null ? `maximum ${usd(r.maximum)}` : null].filter(Boolean).join(", ");
  switch (r.kind) {
    case "flat":
      return `${r.appliesTo}: ${r.amount === null ? "amount missing" : usd(r.amount)}`;
    case "percent_of_loss":
      return `${r.appliesTo}: ${r.percent ?? "?"}% of loss${bounds ? `, ${bounds}` : ""}`;
    case "percent_of_value":
      return `${r.appliesTo}: ${r.percent ?? "?"}% of value at risk${bounds ? `, ${bounds}` : ""}`;
    case "waiting_period":
      return `${r.appliesTo}: ${r.hours ?? "?"}-hour waiting period`;
  }
}

export interface ClaimDeductible {
  /** Dollar deductible for this claim; null when it cannot be expressed in dollars (waiting period, or a percent-of-value rule with no value at risk and no minimum). */
  amount: number | null;
  hours: number | null;
  flags: string[];
  rule: DeductibleRule;
}

/**
 * The deductible a rule produces for one claim.
 *   flat → amount
 *   percent of loss → percent × incurred, clamped to [minimum, maximum]
 *   percent of value → percent × value at risk, clamped; flagged without a value at risk
 *   waiting period → hours, not dollars; excluded from dollar replays
 */
export function deductibleForClaim(rule: DeductibleRule, incurred: number, valueAtRisk: number | null = null): Calc<ClaimDeductible> {
  if (!Number.isFinite(incurred) || incurred < 0) throw new Error(`Expected a non-negative incurred amount, received ${incurred}`);
  const flags: string[] = [];
  let amount: number | null = null;
  let hours: number | null = null;
  const lines: string[] = [];
  const clamp = (raw: number) => {
    let v = raw;
    if (rule.minimum !== null && v < rule.minimum) v = rule.minimum;
    if (rule.maximum !== null && v > rule.maximum) v = rule.maximum;
    return round2(v);
  };
  const clampText = (raw: number, v: number) => (v !== round2(raw) ? ` → ${v < round2(raw) ? "capped at maximum" : "raised to minimum"} ${usd(v)}` : "");
  switch (rule.kind) {
    case "flat":
      if (rule.amount === null) flags.push("flat rule has no amount");
      amount = rule.amount;
      lines.push(`${rule.appliesTo}: flat ${amount === null ? "— (no amount)" : usd(amount)}`);
      break;
    case "percent_of_loss": {
      const pctv = rule.percent ?? 0;
      if (rule.percent === null) flags.push("percent-of-loss rule has no percent");
      const raw = (pctv / 100) * incurred;
      amount = clamp(raw);
      lines.push(`${rule.appliesTo}: ${pctv}% × ${usd2(incurred)} = ${usd2(round2(raw))}${clampText(raw, amount)}`);
      break;
    }
    case "percent_of_value": {
      const pctv = rule.percent ?? 0;
      if (rule.percent === null) flags.push("percent-of-value rule has no percent");
      if (valueAtRisk === null) {
        flags.push("no value at risk known for this claim");
        amount = rule.minimum;
        lines.push(`${rule.appliesTo}: ${pctv}% of value at risk, but no value at risk is known → ${amount === null ? "deductible unknown" : `the minimum ${usd(amount)} is used`}`);
      } else {
        const raw = (pctv / 100) * valueAtRisk;
        amount = clamp(raw);
        lines.push(`${rule.appliesTo}: ${pctv}% × value at risk ${usd(valueAtRisk)} = ${usd2(round2(raw))}${clampText(raw, amount)}`);
      }
      break;
    }
    case "waiting_period":
      hours = rule.hours;
      flags.push("waiting period: not a dollar deductible");
      lines.push(`${rule.appliesTo}: ${hours ?? "?"}-hour waiting period, not expressed in dollars`);
      break;
  }
  return {
    value: { amount, hours, flags, rule },
    math: {
      inputs: { rule: describeRule(rule), incurred, valueAtRisk },
      formula: "flat → amount; percent of loss → % × incurred clamped to [minimum, maximum]; percent of value → % × value at risk clamped; waiting period → hours only",
      steps: { lines },
    },
  };
}

/** The rule for a claim's peril: an exact (case-insensitive) match on applies_to, else the default rule, else null. */
export function matchRule(rules: DeductibleRule[], peril: string | null | undefined): Calc<DeductibleRule | null> {
  const p = norm(peril ?? DEFAULT_PERIL);
  const exact = rules.find((r) => norm(r.appliesTo) === p) ?? null;
  const fallback = rules.find((r) => r.isDefault) ?? null;
  const value = exact ?? fallback;
  return {
    value,
    math: {
      inputs: { peril: peril ?? DEFAULT_PERIL, rules: rules.map((r) => r.appliesTo) },
      formula: "the rule whose applies_to equals the claim's peril (case-insensitive), otherwise the default rule",
      steps: { lines: [value ? `${peril ?? DEFAULT_PERIL} → ${exact ? "matched" : "default"} rule "${value.appliesTo}"` : `${peril ?? DEFAULT_PERIL} → no rule`] },
    },
  };
}

/* ---------- Schedule CSV ---------- */

export const SCHEDULE_COLUMNS = ["applies_to", "kind", "amount", "percent", "minimum", "maximum", "hours", "notes"] as const;
export type ScheduleColumn = (typeof SCHEDULE_COLUMNS)[number];
export const SCHEDULE_REQUIRED_COLUMNS: ScheduleColumn[] = ["applies_to", "kind"];

export function checkScheduleColumns(headers: string[]): Calc<{ missing: ScheduleColumn[]; extra: string[] }> {
  const seen = new Set(headers.map((h) => h.trim().toLowerCase()));
  const missing = SCHEDULE_REQUIRED_COLUMNS.filter((c) => !seen.has(c));
  const extra = headers.filter((h) => !(SCHEDULE_COLUMNS as readonly string[]).includes(h.trim().toLowerCase()));
  return { value: { missing, extra }, math: { inputs: { headers }, formula: "applies_to and kind are required; the other columns depend on the kind", steps: { lines: [missing.length ? `Missing: ${missing.join(", ")}` : "All columns present"] } } };
}

const KIND_ALIASES: Record<string, DeductibleKind> = {
  flat: "flat",
  amount: "flat",
  percent_of_loss: "percent_of_loss",
  "percent of loss": "percent_of_loss",
  "% of loss": "percent_of_loss",
  percent_of_value: "percent_of_value",
  "percent of value": "percent_of_value",
  "% of value": "percent_of_value",
  waiting_period: "waiting_period",
  "waiting period": "waiting_period",
  hours: "waiting_period",
};

export interface ScheduleRowResult {
  row: number;
  raw: Record<string, string>;
  valid: boolean;
  reasons: string[];
  warnings: string[];
  parsed: Omit<DeductibleRule, "id" | "isDefault"> | null;
}

const money = (v: string): number | null => {
  const s = v.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
};

/**
 * Validates schedule rows with kind-specific required fields: a flat rule needs
 * an amount; a percent rule needs a percent (0–100); a waiting period needs
 * whole hours; minimum may not exceed maximum. A repeated applies_to is invalid.
 */
export function validateScheduleRows(rows: Record<string, string>[], ctx: { existingAppliesTo: string[] } = { existingAppliesTo: [] }): Calc<ScheduleRowResult[]> {
  const seen = new Set(ctx.existingAppliesTo.map(norm));
  const results: ScheduleRowResult[] = rows.map((rawIn, i) => {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawIn)) raw[k.trim().toLowerCase()] = (v ?? "").toString().trim();
    const reasons: string[] = [];
    const warnings: string[] = [];
    const appliesTo = raw.applies_to ?? "";
    if (!appliesTo) reasons.push("missing applies_to");
    const kind = KIND_ALIASES[(raw.kind ?? "").toLowerCase()] ?? null;
    if (!raw.kind) reasons.push("missing kind");
    else if (!kind) reasons.push(`unknown kind "${raw.kind}" (use flat, percent_of_loss, percent_of_value or waiting_period)`);
    const num = (key: "amount" | "minimum" | "maximum"): number | null => {
      if (!raw[key]) return null;
      const n = money(raw[key]);
      if (n === null) reasons.push(`${key} "${raw[key]}" is not a non-negative amount`);
      return n;
    };
    const amount = num("amount");
    const minimum = num("minimum");
    const maximum = num("maximum");
    let percent: number | null = null;
    if (raw.percent) {
      const s = raw.percent.replace(/%$/, "");
      percent = /^\d+(\.\d{1,3})?$/.test(s) ? Number(s) : null;
      if (percent === null || percent > 100) {
        reasons.push(`percent "${raw.percent}" must be from 0 to 100`);
        percent = null;
      }
    }
    let hours: number | null = null;
    if (raw.hours) {
      hours = /^\d+$/.test(raw.hours) ? Number(raw.hours) : null;
      if (hours === null) reasons.push(`hours "${raw.hours}" must be a whole number`);
    }
    if (kind === "flat" && amount === null && !reasons.some((r) => r.startsWith("amount"))) reasons.push("a flat rule needs an amount");
    if ((kind === "percent_of_loss" || kind === "percent_of_value") && percent === null && !reasons.some((r) => r.startsWith("percent"))) reasons.push("a percent rule needs a percent");
    if (kind === "waiting_period" && hours === null && !reasons.some((r) => r.startsWith("hours"))) reasons.push("a waiting period needs hours");
    if (minimum !== null && maximum !== null && minimum > maximum) reasons.push(`minimum ${usd(minimum)} is above maximum ${usd(maximum)}`);
    if (kind === "flat" && (percent !== null || minimum !== null || maximum !== null)) warnings.push("percent, minimum and maximum are ignored for a flat rule");
    if (appliesTo) {
      if (seen.has(norm(appliesTo))) reasons.push(`"${appliesTo}" already has a rule`);
      else seen.add(norm(appliesTo));
    }
    const valid = reasons.length === 0;
    return {
      row: i + 1,
      raw,
      valid,
      reasons,
      warnings,
      parsed: valid ? { appliesTo, kind: kind!, amount: kind === "flat" ? amount : null, percent: kind === "percent_of_loss" || kind === "percent_of_value" ? percent : null, minimum: kind === "flat" || kind === "waiting_period" ? null : minimum, maximum: kind === "flat" || kind === "waiting_period" ? null : maximum, hours: kind === "waiting_period" ? hours : null, notes: raw.notes ? raw.notes : null } : null,
    };
  });
  const validCount = results.filter((r) => r.valid).length;
  return {
    value: results,
    math: {
      inputs: { rows: rows.length, existing: ctx.existingAppliesTo.length },
      formula: "flat needs amount; percent kinds need percent 0–100; waiting period needs whole hours; minimum ≤ maximum; applies_to unique per policy",
      steps: { lines: [`${validCount} of ${rows.length} rows valid`, ...results.filter((r) => !r.valid).map((r) => `Row ${r.row}: ${r.reasons.join("; ")}`)] },
    },
  };
}
