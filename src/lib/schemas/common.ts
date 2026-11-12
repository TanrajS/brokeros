import { z } from "zod";
import { isISODate } from "@/lib/domain/dates";
import { parseCurrencyInput } from "@/lib/domain/money";

/** A required YYYY-MM-DD date. */
export const isoDateSchema = z
  .string()
  .trim()
  .min(1, "Choose a date")
  .refine(isISODate, "Enter a valid date (YYYY-MM-DD)");

/** Text that is required after trimming. */
export const requiredText = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be ${max} characters or fewer`);

/** Optional text; blank becomes null so the database never stores "". */
export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .transform((s) => (s === "" ? null : s));

/** Required money amount typed as "48,000" or "48000"; produces a non-negative number. */
export const currencySchema = z.string().transform((raw, ctx) => {
  const r = parseCurrencyInput(raw);
  if (r.value === null) {
    ctx.addIssue({ code: "custom", message: r.error });
    return z.NEVER;
  }
  return r.value;
});

/** Optional money amount: blank → null, otherwise parsed like currencySchema. */
export const optionalCurrencySchema = z.string().transform((raw, ctx) => {
  if (raw.trim() === "") return null;
  const r = parseCurrencyInput(raw);
  if (r.value === null) {
    ctx.addIssue({ code: "custom", message: r.error });
    return z.NEVER;
  }
  return r.value;
});

/** Optional whole number typed into a text input. */
export const optionalIntegerSchema = z.string().transform((raw, ctx) => {
  const s = raw.trim().replace(/,/g, "");
  if (s === "") return null;
  if (!/^\d+$/.test(s)) {
    ctx.addIssue({ code: "custom", message: "Enter a whole number" });
    return z.NEVER;
  }
  return Number(s);
});

/** Percentage 0–100 typed as text, up to three decimals. */
export const percentSchema = z.string().transform((raw, ctx) => {
  const s = raw.trim().replace(/%$/, "");
  if (s === "") {
    ctx.addIssue({ code: "custom", message: "Enter a percentage" });
    return z.NEVER;
  }
  if (!/^\d+(\.\d{1,3})?$/.test(s)) {
    ctx.addIssue({ code: "custom", message: "Enter a percentage such as 12.5" });
    return z.NEVER;
  }
  const n = Number(s);
  if (n > 100) {
    ctx.addIssue({ code: "custom", message: "Must be 100 or less" });
    return z.NEVER;
  }
  return n;
});

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));

export const optionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((s) => (s === "" ? null : s))
  .pipe(z.email("Enter a valid email address").nullable());

export const uuidSchema = z.uuid("Invalid id");
