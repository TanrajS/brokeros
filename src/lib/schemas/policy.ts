import { z } from "zod";
import { COINSURANCE_PERCENTS, ENDORSEMENTS, EXPOSURE_BASES, LINES_OF_BUSINESS, RENEWAL_STATUSES } from "@/lib/constants";
import { isExpiryAfterEffective } from "@/lib/domain/dates";
import {
  currencySchema,
  isoDateSchema,
  optionalCurrencySchema,
  optionalText,
  percentSchema,
  requiredText,
  uuidSchema,
} from "./common";

export const policyFormSchema = z
  .object({
    carrier: requiredText("Carrier", 120),
    lineOfBusiness: z.enum(LINES_OF_BUSINESS, { error: "Choose a line of business" }),
    policyNumber: optionalText(60),
    effectiveDate: isoDateSchema,
    expiryDate: isoDateSchema,
    occurrenceLimit: optionalCurrencySchema,
    aggregateLimit: optionalCurrencySchema,
    deductible: optionalCurrencySchema,
    annualPremium: currencySchema,
    commissionRate: percentSchema,
    exposureBasis: z.enum(EXPOSURE_BASES, { error: "Choose an exposure basis" }),
    exposureAmount: optionalCurrencySchema,
    endorsements: z.array(z.enum(ENDORSEMENTS)),
    renewalStatus: z.enum(RENEWAL_STATUSES, { error: "Choose a renewal status" }),
    previousPolicyId: z
      .string()
      .trim()
      .transform((s) => (s === "" ? null : s))
      .pipe(uuidSchema.nullable()),
    notes: optionalText(5000),
    /** Property only: the adequacy panel's defaults. */
    insurableValue: optionalCurrencySchema,
    coinsurancePercent: z
      .string()
      .trim()
      .transform((raw, ctx) => {
        if (raw === "") return null;
        const n = Number(raw.replace(/%$/, ""));
        if (!(COINSURANCE_PERCENTS as readonly number[]).includes(n)) {
          ctx.addIssue({ code: "custom", message: "Choose 80, 90 or 100" });
          return z.NEVER;
        }
        return n;
      }),
  })
  .superRefine((v, ctx) => {
    if (!isExpiryAfterEffective(v.effectiveDate, v.expiryDate).value) {
      ctx.addIssue({ code: "custom", path: ["expiryDate"], message: "Expiry must be after the effective date" });
    }
  });

export type PolicyFormInput = z.input<typeof policyFormSchema>;
export type PolicyFormValues = z.output<typeof policyFormSchema>;

export const emptyPolicyForm = (effectiveDate: string, expiryDate: string): PolicyFormInput => ({
  carrier: "",
  lineOfBusiness: "General Liability",
  policyNumber: "",
  effectiveDate,
  expiryDate,
  occurrenceLimit: "",
  aggregateLimit: "",
  deductible: "",
  annualPremium: "",
  commissionRate: "",
  exposureBasis: "revenue",
  exposureAmount: "",
  endorsements: [],
  renewalStatus: "not_started",
  previousPolicyId: "",
  notes: "",
  insurableValue: "",
  coinsurancePercent: "",
});
