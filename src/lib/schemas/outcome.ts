import { z } from "zod";
import { LOST_REASONS } from "@/lib/constants";
import { currencySchema, optionalCurrencySchema, optionalText, percentSchema, requiredText } from "./common";

/**
 * Which renewal limits are mandatory. A limit is required when the expiring
 * policy carried one; lines without limits (e.g. Property, Workers Comp) may
 * leave them blank.
 */
export interface RenewedRequirements {
  occurrenceLimit: boolean;
  aggregateLimit: boolean;
}

export function renewedOutcomeSchema(req: RenewedRequirements) {
  return z
    .object({
      renewalCarrier: requiredText("Renewal carrier", 120),
      renewalPremium: currencySchema,
      renewalExposureAmount: currencySchema,
      renewalDeductible: currencySchema,
      renewalOccurrenceLimit: optionalCurrencySchema,
      renewalAggregateLimit: optionalCurrencySchema,
      renewalCommissionRate: percentSchema,
    })
    .superRefine((v, ctx) => {
      if (req.occurrenceLimit && v.renewalOccurrenceLimit === null) {
        ctx.addIssue({ code: "custom", path: ["renewalOccurrenceLimit"], message: "Enter the renewal occurrence limit" });
      }
      if (req.aggregateLimit && v.renewalAggregateLimit === null) {
        ctx.addIssue({ code: "custom", path: ["renewalAggregateLimit"], message: "Enter the renewal aggregate limit" });
      }
    });
}
export type RenewedOutcomeInput = z.input<ReturnType<typeof renewedOutcomeSchema>>;
export type RenewedOutcomeValues = z.output<ReturnType<typeof renewedOutcomeSchema>>;

export const lostOutcomeSchema = z.object({
  lostReason: z.enum(LOST_REASONS, { error: "Choose a reason" }),
  competingPremium: optionalCurrencySchema,
  details: optionalText(2000),
});
export type LostOutcomeInput = z.input<typeof lostOutcomeSchema>;
export type LostOutcomeValues = z.output<typeof lostOutcomeSchema>;

export const nonRenewedOutcomeSchema = z.object({
  reason: requiredText("Reason", 2000),
});
export type NonRenewedOutcomeInput = z.input<typeof nonRenewedOutcomeSchema>;
export type NonRenewedOutcomeValues = z.output<typeof nonRenewedOutcomeSchema>;
