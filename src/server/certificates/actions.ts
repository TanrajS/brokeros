"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { certificateContent } from "@/lib/domain/certificates";
import { policyYearLabel } from "@/lib/domain/documents";
import { certificateFormSchema, type CertificateFormInput } from "@/lib/schemas/document";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult } from "@/server/actionResult";
import { getDb } from "@/server/db/client";
import { accounts, documents, policies } from "@/server/db/schema";
import { BlobNotConfiguredError, blobReady, uploadDocumentBlob } from "@/server/documents/blob";
import { getWorkspaceBySlug } from "@/server/workspace/queries";
import { certificateInsurers, toCertificatePolicy } from "./queries";
import { renderCertificatePdf } from "./pdf";

/**
 * Renders a Certificate of Insurance for the policy's current term, stores the
 * PDF in Blob and files it as a `certificate` document on the policy. The issue
 * date is the workspace's as-of date.
 */
export async function generateCertificate(slug: string, policyId: string, input: CertificateFormInput): Promise<ActionResult<{ documentId: string }>> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    if (!blobReady()) return fail("Documents are not configured on this deployment (BLOB_READ_WRITE_TOKEN is missing).");
    const parsed = certificateFormSchema.safeParse(input);
    if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
    const db = getDb();
    const policy = await db.query.policies.findFirst({ where: and(eq(policies.id, policyId), eq(policies.workspaceId, ws.id)) });
    if (!policy) return fail("That policy no longer exists.");
    const account = await db.query.accounts.findFirst({ where: eq(accounts.id, policy.accountId) });
    if (!account) return fail("That account no longer exists.");
    const accountPolicies = await db.select().from(policies).where(and(eq(policies.workspaceId, ws.id), eq(policies.accountId, policy.accountId)));
    const v = parsed.data;
    const included = accountPolicies.filter((p) => v.includePolicyIds.includes(p.id) && p.id !== policy.id);
    if (included.length !== v.includePolicyIds.filter((id) => id !== policy.id).length) return fail("Please fix the highlighted fields.", { includePolicyIds: "Choose policies on this account" });
    const insurers = await certificateInsurers(ws.id, policy);
    const content = certificateContent({
      namedInsured: { name: account.name, province: account.province, industry: account.industry },
      holder: { name: v.holderName, address: v.holderAddress },
      operations: v.operations,
      issueDate: ws.asOfDate,
      policy: toCertificatePolicy(policy),
      insurers,
      included: included.map(toCertificatePolicy),
    }).value;
    const pdf = await renderCertificatePdf(content);
    const fileName = `${content.reference}.pdf`;
    const blob = await uploadDocumentBlob(`w/${ws.id}/${policy.accountId}/certificate/${fileName}`, pdf, "application/pdf");
    const [row] = await db
      .insert(documents)
      .values({
        workspaceId: ws.id,
        accountId: policy.accountId,
        policyId: policy.id,
        docType: "certificate",
        title: `Certificate of Insurance, ${v.holderName}, ${policy.lineOfBusiness}`,
        policyYear: policyYearLabel(policy.effectiveDate, policy.expiryDate),
        status: null,
        markets: [],
        fileUrl: blob.url,
        filePathname: blob.pathname,
        fileName,
        mimeType: "application/pdf",
        sizeBytes: pdf.byteLength,
        notes: `Issued ${ws.asOfDate} to ${v.holderName}. ${content.operations}`,
      })
      .returning({ id: documents.id });
    revalidatePath(`/w/${slug}`, "layout");
    return ok({ documentId: row.id });
  } catch (err) {
    if (err instanceof BlobNotConfiguredError) return fail(err.message);
    return fail(describeFailure("generating the certificate", err));
  }
}
