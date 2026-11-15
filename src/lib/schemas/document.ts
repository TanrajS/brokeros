import { z } from "zod";
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from "@/lib/domain/documents";
import { optionalText, requiredText } from "./common";

const optionalUuid = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s))
  .pipe(z.uuid("Invalid policy").nullable());

/**
 * Metadata for an uploaded document. The file itself is checked separately
 * (type and size) by `checkDocumentFile`; a submission needs at least one market
 * and only proposals carry a status.
 */
export const documentFormSchema = z
  .object({
    docType: z.enum(DOCUMENT_TYPES, { error: "Choose a folder" }),
    title: requiredText("Title", 160),
    policyYear: optionalText(20),
    status: z.enum(DOCUMENT_STATUSES).or(z.literal("")).transform((s) => (s === "" ? null : s)),
    markets: z.array(z.string().trim().min(1).max(120)).max(30),
    policyId: optionalUuid,
    notes: optionalText(1000),
  })
  .superRefine((v, ctx) => {
    if (v.docType === "submission" && v.markets.length === 0) ctx.addIssue({ code: "custom", path: ["markets"], message: "Choose at least one market for a submission" });
    if (v.docType === "proposal" && v.status === null) ctx.addIssue({ code: "custom", path: ["status"], message: "Mark the proposal Draft or Final" });
  });
export type DocumentFormInput = z.input<typeof documentFormSchema>;
export type DocumentFormValues = z.output<typeof documentFormSchema>;

export const renameDocumentSchema = z.object({ title: requiredText("Title", 160) });

/** Inputs for a generated Certificate of Insurance. Holder details are fictional in the demo. */
export const certificateFormSchema = z.object({
  holderName: requiredText("Certificate holder", 160),
  holderAddress: requiredText("Holder address", 400),
  operations: requiredText("Description of operations", 1000),
  includePolicyIds: z.array(z.uuid()).max(20),
});
export type CertificateFormInput = z.input<typeof certificateFormSchema>;
export type CertificateFormValues = z.output<typeof certificateFormSchema>;
