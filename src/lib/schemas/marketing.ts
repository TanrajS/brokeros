import { z } from "zod";
import { DECLINE_REASONS, ENDORSEMENTS } from "@/lib/constants";
import { currencySchema, isoDateSchema, optionalCurrencySchema, optionalText, percentSchema, requiredText } from "./common";

const optionalDate = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s))
  .pipe(isoDateSchema.nullable());

/** Carrier approached. A sent date makes it "submitted"; without one it is "planned". */
export function submissionFormSchema(asOf: string) {
  return z
    .object({
      carrier: requiredText("Carrier", 120),
      sentOn: optionalDate,
      notes: optionalText(2000),
    })
    .superRefine((v, ctx) => {
      if (v.sentOn !== null && v.sentOn > asOf) ctx.addIssue({ code: "custom", path: ["sentOn"], message: `Sent date cannot be after the as-of date (${asOf})` });
    });
}
export type SubmissionFormInput = z.input<ReturnType<typeof submissionFormSchema>>;
export type SubmissionFormValues = z.output<ReturnType<typeof submissionFormSchema>>;

export function declineFormSchema(asOf: string) {
  return z
    .object({
      declinedReason: z.enum(DECLINE_REASONS, { error: "Choose a reason" }),
      respondedOn: isoDateSchema,
      notes: optionalText(2000),
    })
    .superRefine((v, ctx) => {
      if (v.respondedOn > asOf) ctx.addIssue({ code: "custom", path: ["respondedOn"], message: `Response date cannot be after the as-of date (${asOf})` });
    });
}
export type DeclineFormInput = z.input<ReturnType<typeof declineFormSchema>>;
export type DeclineFormValues = z.output<ReturnType<typeof declineFormSchema>>;

/**
 * A quote. valid_until may be in the past (an old quote being recorded); the app
 * flags it as expired and will not bind it.
 */
export function quoteFormSchema(asOf: string) {
  return z
    .object({
      quotedPremium: currencySchema.refine((n) => n > 0, "Enter the quoted premium"),
      occurrenceLimit: optionalCurrencySchema,
      aggregateLimit: optionalCurrencySchema,
      deductible: optionalCurrencySchema,
      endorsements: z.array(z.enum(ENDORSEMENTS)),
      commissionRate: percentSchema,
      exposureAmount: optionalCurrencySchema,
      subjectivities: optionalText(4000),
      validUntil: isoDateSchema,
      isIncumbentRenewal: z.boolean(),
      respondedOn: isoDateSchema,
    })
    .superRefine((v, ctx) => {
      if (v.respondedOn > asOf) ctx.addIssue({ code: "custom", path: ["respondedOn"], message: `Quote date cannot be after the as-of date (${asOf})` });
      if (v.occurrenceLimit !== null && v.aggregateLimit !== null && v.aggregateLimit < v.occurrenceLimit) {
        ctx.addIssue({ code: "custom", path: ["aggregateLimit"], message: "Aggregate is normally at least the occurrence limit" });
      }
    });
}
export type QuoteFormInput = z.input<ReturnType<typeof quoteFormSchema>>;
export type QuoteFormValues = z.output<ReturnType<typeof quoteFormSchema>>;
