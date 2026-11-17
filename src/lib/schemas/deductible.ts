import { z } from "zod";
import { DEDUCTIBLE_KINDS } from "@/lib/domain/deductibles";
import { optionalCurrencySchema, optionalText, requiredText } from "./common";

const optionalPercent = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s.replace(/%$/, "")))
  .transform((s, ctx) => {
    if (s === null) return null;
    if (!/^\d+(\.\d{1,3})?$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "Enter a percentage such as 10" });
      return z.NEVER;
    }
    const n = Number(s);
    if (n > 100) {
      ctx.addIssue({ code: "custom", message: "Must be 100 or less" });
      return z.NEVER;
    }
    return n;
  });

const optionalHours = z
  .string()
  .trim()
  .transform((s, ctx) => {
    if (s === "") return null;
    if (!/^\d+$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "Enter whole hours" });
      return z.NEVER;
    }
    return Number(s);
  });

/** One coverage part: a deductible rule (required fields depend on the kind; minimum may not exceed maximum) plus optional occurrence and aggregate limits (aggregate not below occurrence). */
export const deductibleFormSchema = z
  .object({
    appliesTo: requiredText("Applies to", 80),
    kind: z.enum(DEDUCTIBLE_KINDS, { error: "Choose a kind" }),
    amount: optionalCurrencySchema,
    percent: optionalPercent,
    minimum: optionalCurrencySchema,
    maximum: optionalCurrencySchema,
    hours: optionalHours,
    occurrenceLimit: optionalCurrencySchema,
    aggregateLimit: optionalCurrencySchema,
    notes: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.occurrenceLimit !== null && v.aggregateLimit !== null && v.aggregateLimit < v.occurrenceLimit) ctx.addIssue({ code: "custom", path: ["aggregateLimit"], message: "Aggregate limit cannot be below the occurrence limit" });
    if (v.kind === "flat" && v.amount === null) ctx.addIssue({ code: "custom", path: ["amount"], message: "A flat deductible needs an amount" });
    if ((v.kind === "percent_of_loss" || v.kind === "percent_of_value") && v.percent === null) ctx.addIssue({ code: "custom", path: ["percent"], message: "A percent deductible needs a percent" });
    if (v.kind === "waiting_period" && v.hours === null) ctx.addIssue({ code: "custom", path: ["hours"], message: "A waiting period needs hours" });
    if (v.minimum !== null && v.maximum !== null && v.minimum > v.maximum) ctx.addIssue({ code: "custom", path: ["maximum"], message: "Maximum must be at least the minimum" });
  });
export type DeductibleFormInput = z.input<typeof deductibleFormSchema>;
export type DeductibleFormValues = z.output<typeof deductibleFormSchema>;
