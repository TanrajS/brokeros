"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { checkDocumentFile } from "@/lib/domain/documents";
import { documentFormSchema, renameDocumentSchema, type DocumentFormInput } from "@/lib/schemas/document";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult } from "@/server/actionResult";
import { getDb } from "@/server/db/client";
import { accounts, documents, policies } from "@/server/db/schema";
import { getWorkspaceBySlug } from "@/server/workspace/queries";
import { BlobNotConfiguredError, blobReady, deleteBlob, uploadDocumentBlob } from "./blob";

function refresh(slug: string) {
  revalidatePath(`/w/${slug}`, "layout");
}

const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "file";

/**
 * Uploads one document: the metadata is validated with the shared schema, the
 * file with `checkDocumentFile` (type and size), and nothing is stored unless
 * both pass. The blob is private and lives under a random pathname.
 */
export async function uploadDocument(slug: string, accountId: string, form: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    if (!blobReady()) return fail("Documents are not configured on this deployment (BLOB_READ_WRITE_TOKEN is missing).");
    const db = getDb();
    const account = await db.query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) });
    if (!account) return fail("That account no longer exists.");

    const text = (k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string) : "");
    let markets: string[] = [];
    try {
      const parsedMarkets = JSON.parse(text("markets") || "[]");
      markets = Array.isArray(parsedMarkets) ? parsedMarkets.filter((m): m is string => typeof m === "string") : [];
    } catch {
      markets = [];
    }
    const input: DocumentFormInput = { docType: text("docType") as DocumentFormInput["docType"], title: text("title"), policyYear: text("policyYear"), status: text("status") as DocumentFormInput["status"], markets, policyId: text("policyId"), notes: text("notes") };
    const parsed = documentFormSchema.safeParse(input);
    const file = form.get("file");
    const fileCheck = file instanceof File ? checkDocumentFile(file.name, file.size).value : { ok: false, mimeType: null, reason: "Choose a file" };
    const fieldErrors = { ...(parsed.success ? {} : fieldErrorsFromZod(parsed.error)), ...(fileCheck.ok ? {} : { file: fileCheck.reason! }) };
    if (!parsed.success || !fileCheck.ok || !(file instanceof File)) return fail("Please fix the highlighted fields.", fieldErrors);
    const v = parsed.data;
    if (v.policyId) {
      const policy = await db.query.policies.findFirst({ where: and(eq(policies.id, v.policyId), eq(policies.accountId, accountId)) });
      if (!policy) return fail("Please fix the highlighted fields.", { policyId: "Choose a policy on this account" });
    }
    const blob = await uploadDocumentBlob(`w/${ws.id}/${accountId}/${v.docType}/${safeName(file.name)}`, file, fileCheck.mimeType!);
    const [row] = await db
      .insert(documents)
      .values({
        workspaceId: ws.id,
        accountId,
        policyId: v.policyId,
        docType: v.docType,
        title: v.title,
        policyYear: v.policyYear,
        status: v.docType === "proposal" ? v.status : null,
        markets: v.docType === "submission" ? v.markets : [],
        fileUrl: blob.url,
        filePathname: blob.pathname,
        fileName: file.name,
        mimeType: fileCheck.mimeType!,
        sizeBytes: file.size,
        notes: v.notes,
      })
      .returning({ id: documents.id });
    refresh(slug);
    return ok({ id: row.id });
  } catch (err) {
    if (err instanceof BlobNotConfiguredError) return fail(err.message);
    return fail(describeFailure("uploading the document", err));
  }
}

export async function renameDocument(slug: string, documentId: string, input: { title: string }): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const parsed = renameDocumentSchema.safeParse(input);
    if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
    const rows = await getDb().update(documents).set({ title: parsed.data.title, updatedAt: new Date() }).where(and(eq(documents.id, documentId), eq(documents.workspaceId, ws.id))).returning({ id: documents.id });
    if (rows.length === 0) return fail("That document no longer exists.");
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("renaming the document", err));
  }
}

/** Deletes the row and, unless the document is a shared seed file, its blob. */
export async function deleteDocument(slug: string, documentId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const [row] = await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.workspaceId, ws.id)));
    if (!row) return fail("That document no longer exists.");
    if (!row.isSeed && blobReady()) await deleteBlob(row.fileUrl);
    await db.delete(documents).where(eq(documents.id, row.id));
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("deleting the document", err));
  }
}
