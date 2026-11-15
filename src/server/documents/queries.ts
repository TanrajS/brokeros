import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { certificateReissueNeeded, policyYearLabel, type DocumentType } from "@/lib/domain/documents";
import { getDb } from "@/server/db/client";
import { documents, layerParticipations, policies, programLayers, type Document, type Policy, type Workspace } from "@/server/db/schema";

export interface DocumentView extends Document {
  /** Certificates only: the certificate's policy has a successor or has expired at the as-of date. */
  reissueNeeded: boolean;
  reissueReason: string | null;
  policyLabel: string | null;
}

/** Documents on one account, newest upload first, with the certificate reissue flag derived from the policy. */
export async function listAccountDocuments(ws: Workspace, accountId: string, accountPolicies: Policy[], docType?: DocumentType): Promise<DocumentView[]> {
  const where = docType ? and(eq(documents.workspaceId, ws.id), eq(documents.accountId, accountId), eq(documents.docType, docType)) : and(eq(documents.workspaceId, ws.id), eq(documents.accountId, accountId));
  const rows = await getDb().select().from(documents).where(where).orderBy(desc(documents.uploadedAt));
  return rows.map((d) => decorate(d, accountPolicies, ws.asOfDate));
}

export async function listPolicyDocuments(ws: Workspace, policyId: string, accountPolicies: Policy[]): Promise<DocumentView[]> {
  const rows = await getDb().select().from(documents).where(and(eq(documents.workspaceId, ws.id), eq(documents.policyId, policyId))).orderBy(desc(documents.uploadedAt));
  return rows.map((d) => decorate(d, accountPolicies, ws.asOfDate));
}

function decorate(d: Document, accountPolicies: Policy[], asOf: string): DocumentView {
  const policy = d.policyId ? (accountPolicies.find((p) => p.id === d.policyId) ?? null) : null;
  const reissue =
    d.docType === "certificate" && policy
      ? certificateReissueNeeded({ policyId: policy.id, expiryDate: policy.expiryDate, successorIds: accountPolicies.filter((p) => p.previousPolicyId === policy.id).map((p) => p.id) }, asOf).value
      : { reissueNeeded: false, reason: null };
  return { ...d, reissueNeeded: reissue.reissueNeeded, reissueReason: reissue.reason, policyLabel: policy ? `${policy.lineOfBusiness} · ${policy.carrier} · ${policyYearLabel(policy.effectiveDate, policy.expiryDate)}` : null };
}

export async function getDocument(workspaceId: string, documentId: string): Promise<Document | null> {
  const [row] = await getDb().select().from(documents).where(and(eq(documents.id, documentId), eq(documents.workspaceId, workspaceId)));
  return row ?? null;
}

/** Policy-year labels available on the account, newest first, de-duplicated. */
export function accountPolicyYears(accountPolicies: Policy[]): string[] {
  return [...new Set([...accountPolicies].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate)).map((p) => policyYearLabel(p.effectiveDate, p.expiryDate)))];
}

/** Insurers already named in the workspace (policy carriers and participations), for the submission market picker. */
export async function workspaceInsurers(workspaceId: string): Promise<string[]> {
  const db = getDb();
  const [carriers, parts] = await Promise.all([
    db.selectDistinct({ name: policies.carrier }).from(policies).where(eq(policies.workspaceId, workspaceId)),
    db.selectDistinct({ name: layerParticipations.insurer }).from(layerParticipations).where(eq(layerParticipations.workspaceId, workspaceId)),
  ]);
  return [...new Set([...carriers.map((c) => c.name), ...parts.map((p) => p.name)])].sort((a, b) => a.localeCompare(b));
}

/** Document counts per policy id, for the policy page badge. */
export async function countPolicyDocuments(workspaceId: string, policyIds: string[]): Promise<Map<string, number>> {
  if (policyIds.length === 0) return new Map();
  const rows = await getDb().select({ policyId: documents.policyId }).from(documents).where(and(eq(documents.workspaceId, workspaceId), inArray(documents.policyId, policyIds)));
  const out = new Map<string, number>();
  for (const r of rows) if (r.policyId) out.set(r.policyId, (out.get(r.policyId) ?? 0) + 1);
  return out;
}

/** The layers (with participations) of a line group that a policy sits in, for the certificate's insurer list. */
export async function layersForPolicy(workspaceId: string, accountId: string, lineGroup: "gl" | "auto" | "property") {
  const db = getDb();
  const layerRows = await db.select().from(programLayers).where(and(eq(programLayers.workspaceId, workspaceId), eq(programLayers.accountId, accountId), eq(programLayers.lineGroup, lineGroup))).orderBy(asc(programLayers.towerLabel), asc(programLayers.attachment));
  const parts = layerRows.length ? await db.select().from(layerParticipations).where(inArray(layerParticipations.layerId, layerRows.map((l) => l.id))).orderBy(asc(layerParticipations.createdAt)) : [];
  return { layerRows, parts };
}
