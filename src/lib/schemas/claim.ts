import { z } from "zod";
import { CLAIM_STATUSES, LINES_OF_BUSINESS } from "@/lib/constants";
import { currencySchema, isoDateSchema, optionalText, requiredText, uuidSchema } from "./common";

/**
 * Claim form. Needs the workspace as-of date: the report date may not be after it.
 * A closed claim with a reserve is allowed (reopened files exist) only when confirmed.
 */
export function claimFormSchema(asOf: string) {
  return z
    .object({
      lineOfBusiness: z.enum(LINES_OF_BUSINESS, { error: "Choose a line of business" }),
      policyId: z
        .string()
        .trim()
        .transform((s) => (s === "" ? null : s))
        .pipe(uuidSchema.nullable()),
      claimNumber: requiredText("Claim number", 60),
      dateOfLoss: isoDateSchema,
      dateReported: isoDateSchema,
      description: optionalText(2000),
      paid: currencySchema,
      reserved: currencySchema,
      status: z.enum(CLAIM_STATUSES, { error: "Choose a status" }),
      confirmClosedWithReserve: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (v.dateReported < v.dateOfLoss) {
        ctx.addIssue({ code: "custom", path: ["dateReported"], message: "Date reported must be on or after the date of loss" });
      }
      if (v.dateReported > asOf) {
        ctx.addIssue({ code: "custom", path: ["dateReported"], message: `Date reported cannot be after the as-of date (${asOf})` });
      }
      if (v.dateOfLoss > asOf) {
        ctx.addIssue({ code: "custom", path: ["dateOfLoss"], message: `Date of loss cannot be after the as-of date (${asOf})` });
      }
      if (v.status === "closed" && v.reserved > 0 && !v.confirmClosedWithReserve) {
        ctx.addIssue({ code: "custom", path: ["confirmClosedWithReserve"], message: "Confirm that this closed claim still carries a reserve" });
      }
    });
}
export type ClaimFormInput = z.input<ReturnType<typeof claimFormSchema>>;
export type ClaimFormValues = z.output<ReturnType<typeof claimFormSchema>>;

/* ---------- Loss-run analysis settings (kept in the URL) ---------- */

const money = currencySchema;

/** Trend rate as a percent, e.g. "5" or "-2.5"; between −50 and 100. */
const trendPercent = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    const s = raw.replace(/%$/, "").replace(/^−/, "-").replace(/^\+/, "");
    if (!/^-?\d+(\.\d{1,2})?$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "Enter a percentage such as 5 or -2.5" });
      return z.NEVER;
    }
    const n = Number(s);
    if (n < -50 || n > 100) {
      ctx.addIssue({ code: "custom", message: "Use a trend between -50% and 100%" });
      return z.NEVER;
    }
    return n;
  });

/** A development factor such as "1.15"; above 0 and at most 10. */
const factor = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    if (!/^\d+(\.\d{1,3})?$/.test(raw)) {
      ctx.addIssue({ code: "custom", message: "Enter a factor such as 1.15" });
      return z.NEVER;
    }
    const n = Number(raw);
    if (n <= 0 || n > 10) {
      ctx.addIssue({ code: "custom", message: "Use a factor above 0 and up to 10" });
      return z.NEVER;
    }
    return n;
  });

export const lossRunSettingsSchema = z.object({
  trendOn: z.boolean(),
  trend: trendPercent,
  developmentOn: z.boolean(),
  ldf12: factor,
  ldf24: factor,
  ldf36: factor,
  ldf48: factor,
  ldf60: factor,
  threshold: money,
  cap: money,
});
export type LossRunSettingsInput = z.input<typeof lossRunSettingsSchema>;
export type LossRunSettingsValues = z.output<typeof lossRunSettingsSchema>;

export const DEFAULT_LOSS_RUN_SETTINGS: LossRunSettingsInput = {
  trendOn: false,
  trend: "0",
  developmentOn: false,
  ldf12: "1.00",
  ldf24: "1.00",
  ldf36: "1.00",
  ldf48: "1.00",
  ldf60: "1.00",
  threshold: "25000",
  cap: "25000",
};
