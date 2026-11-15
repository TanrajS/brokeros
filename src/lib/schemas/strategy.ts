import { z } from "zod";
import { lossRunSettingsSchema } from "./claim";
import { currencySchema, optionalCurrencySchema, requiredText } from "./common";

/** A retention option: a deductible (or self-insured retention) with its annual premium and an optional yearly cap. */
export const quoteOptionFormSchema = z
  .object({
    label: requiredText("Label", 80),
    carrier: requiredText("Carrier", 120),
    deductible: currencySchema,
    aggregateCap: optionalCurrencySchema,
    premium: currencySchema.refine((n) => n > 0, "Enter the annual premium"),
  })
  .superRefine((v, ctx) => {
    if (v.aggregateCap !== null && v.aggregateCap < v.deductible) {
      ctx.addIssue({ code: "custom", path: ["aggregateCap"], message: "The aggregate cap is normally at least the deductible" });
    }
  });
export type QuoteOptionFormInput = z.input<typeof quoteOptionFormSchema>;
export type QuoteOptionFormValues = z.output<typeof quoteOptionFormSchema>;

/** Whole number of policy years to replay, 1 to 10. */
const yearsField = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    if (!/^\d+$/.test(raw)) {
      ctx.addIssue({ code: "custom", message: "Enter a whole number of years" });
      return z.NEVER;
    }
    const n = Number(raw);
    if (n < 1 || n > 10) {
      ctx.addIssue({ code: "custom", message: "Use between 1 and 10 policy years" });
      return z.NEVER;
    }
    return n;
  });

/** Strategy analysis settings: years to replay, running-year toggle, and the v0.4 trend/development inputs. */
export const strategySettingsSchema = lossRunSettingsSchema
  .pick({ trendOn: true, trend: true, developmentOn: true, ldf12: true, ldf24: true, ldf36: true, ldf48: true, ldf60: true })
  .extend({ years: yearsField, includeCurrent: z.boolean() });
export type StrategySettingsInput = z.input<typeof strategySettingsSchema>;
export type StrategySettingsValues = z.output<typeof strategySettingsSchema>;

export const DEFAULT_STRATEGY_SETTINGS: StrategySettingsInput = {
  years: "5",
  includeCurrent: true,
  trendOn: false,
  trend: "0",
  developmentOn: false,
  ldf12: "1.00",
  ldf24: "1.00",
  ldf36: "1.00",
  ldf48: "1.00",
  ldf60: "1.00",
};

/** Money that may be left blank: blank means zero. */
const moneyOrZero = z
  .string()
  .transform((raw) => (raw.trim() === "" ? "0" : raw))
  .pipe(currencySchema);

/** The account's own TCOR inputs; all default to zero. */
export const tcorFeesFormSchema = z.object({
  brokerFees: moneyOrZero,
  riskControlSpend: moneyOrZero,
  claimsAdminCost: moneyOrZero,
});
export type TcorFeesFormInput = z.input<typeof tcorFeesFormSchema>;
export type TcorFeesFormValues = z.output<typeof tcorFeesFormSchema>;

/** v1.4: the account's risk-tolerance inputs; blank tolerances fall back to the defaults (0.5% and 1% of revenue). */
const optionalMoney = z
  .string()
  .transform((raw) => (raw.trim() === "" ? "" : raw))
  .pipe(optionalCurrencySchema);
const lossRatio = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    if (!/^0?\.\d{1,3}$|^1(\.0{1,3})?$/.test(raw)) {
      ctx.addIssue({ code: "custom", message: "Enter a ratio such as 0.65" });
      return z.NEVER;
    }
    const n = Number(raw);
    if (n < 0.1 || n > 1) {
      ctx.addIssue({ code: "custom", message: "Use a ratio between 0.10 and 1.00" });
      return z.NEVER;
    }
    return n;
  });
export const toleranceFormSchema = z
  .object({
    toleranceOccurrence: optionalMoney,
    toleranceYear: optionalMoney,
    permissibleLossRatio: lossRatio,
  })
  .superRefine((v, ctx) => {
    if (v.toleranceOccurrence !== null && v.toleranceYear !== null && v.toleranceYear < v.toleranceOccurrence) {
      ctx.addIssue({ code: "custom", path: ["toleranceYear"], message: "The annual tolerance is normally at least the per-occurrence tolerance" });
    }
  });
export type ToleranceFormInput = z.input<typeof toleranceFormSchema>;
export type ToleranceFormValues = z.output<typeof toleranceFormSchema>;
