import { z } from "zod";
import { COINSURANCE_PERCENTS, PARTICIPANT_ROLES } from "@/lib/constants";
import { LAYER_TYPES, LINE_GROUPS } from "@/lib/domain/program";
import { currencySchema, optionalCurrencySchema, optionalText, percentSchema, requiredText, uuidSchema } from "./common";

const optionalUuid = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s))
  .pipe(uuidSchema.nullable());

/* ---------- Tower layers ---------- */

/** The simple (v0.5) layer form: one insurer at 100%. Saved as a program layer with a single participation. */
export const towerLayerFormSchema = z.object({
  lineGroup: z.enum(LINE_GROUPS, { error: "Choose a line group" }),
  layerType: z.enum(LAYER_TYPES, { error: "Choose a layer type" }),
  carrier: requiredText("Carrier", 120),
  attachment: currencySchema,
  limit: currencySchema.refine((n) => n > 0, "Limit must be more than zero"),
  premium: currencySchema,
  policyId: optionalUuid,
});
export type TowerLayerFormInput = z.input<typeof towerLayerFormSchema>;
export type TowerLayerFormValues = z.output<typeof towerLayerFormSchema>;

/** v1.3: a layer in the advanced view (insurers are added as participations). */
export const layerFormSchema = z.object({
  lineGroup: z.enum(LINE_GROUPS, { error: "Choose a line group" }),
  towerLabel: requiredText("Tower", 40),
  layerType: z.enum(LAYER_TYPES, { error: "Choose a layer type" }),
  attachment: currencySchema,
  limit: currencySchema.refine((n) => n > 0, "Limit must be more than zero"),
  policyId: optionalUuid,
  notes: optionalText(500),
});
export type LayerFormInput = z.input<typeof layerFormSchema>;
export type LayerFormValues = z.output<typeof layerFormSchema>;

const optionalPercent = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s))
  .pipe(percentSchema.nullable());

/** v1.3: one insurer's line on a layer. Signed may not exceed written when both are given. The premium is quoted at 100% of the layer (v1.5). */
export const participationFormSchema = z
  .object({
    insurer: requiredText("Insurer", 120),
    writtenLinePct: optionalPercent,
    signedLinePct: percentSchema,
    premium100: currencySchema,
    policyNumber: optionalText(60),
    isLead: z.boolean(),
    notes: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.writtenLinePct !== null && v.signedLinePct > v.writtenLinePct) ctx.addIssue({ code: "custom", path: ["signedLinePct"], message: "Signed line cannot be above the written line" });
  });
export type ParticipationFormInput = z.input<typeof participationFormSchema>;
export type ParticipationFormValues = z.output<typeof participationFormSchema>;

/* ---------- Participants (co-insurers) ---------- */

export const participantFormSchema = z.object({
  carrier: requiredText("Carrier", 120),
  role: z.enum(PARTICIPANT_ROLES, { error: "Choose a role" }),
  signedLine: percentSchema.refine((n) => n > 0, "Signed line must be more than 0%"),
  premium: optionalCurrencySchema,
  notes: optionalText(500),
});
export type ParticipantFormInput = z.input<typeof participantFormSchema>;
export type ParticipantFormValues = z.output<typeof participantFormSchema>;

/* ---------- Sub-limits ---------- */

export const sublimitFormSchema = z
  .object({
    name: requiredText("Coverage", 120),
    limit: optionalCurrencySchema,
    deductible: optionalCurrencySchema,
    notes: optionalText(500),
  })
  .refine((v) => v.limit !== null || v.deductible !== null, { path: ["limit"], message: "Enter a limit, a deductible, or both" });
export type SublimitFormInput = z.input<typeof sublimitFormSchema>;
export type SublimitFormValues = z.output<typeof sublimitFormSchema>;

/* ---------- Property adequacy ---------- */

export const coinsurancePercentSchema = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    const n = Number(raw.replace(/%$/, ""));
    if (!(COINSURANCE_PERCENTS as readonly number[]).includes(n)) {
      ctx.addIssue({ code: "custom", message: "Choose 80, 90 or 100" });
      return z.NEVER;
    }
    return n;
  });

export const adequacyFormSchema = z.object({
  insurableValue: currencySchema.refine((n) => n > 0, "Enter the insurable value"),
  coinsurancePercent: coinsurancePercentSchema,
  carriedLimit: currencySchema,
  loss: currencySchema,
  deductible: currencySchema,
});
export type AdequacyFormInput = z.input<typeof adequacyFormSchema>;
export type AdequacyFormValues = z.output<typeof adequacyFormSchema>;
