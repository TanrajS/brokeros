import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { CertificateInsurer, CertificatePolicyInput } from "@/lib/domain/certificates";
import { getDb } from "@/server/db/client";
import { layerParticipations, programLayers, type Policy } from "@/server/db/schema";

const groupFor = (line: string): "gl" | "auto" | "property" | null => (line === "General Liability" ? "gl" : line === "Commercial Auto" ? "auto" : line === "Property" ? "property" : null);

/**
 * The insurers on the layer written on this policy (the layer linked to it, else
 * the bottom layer of its line group) with their signed lines; empty when the
 * policy is not placed through the program, so the certificate names the
 * policy's own carrier at 100%.
 */
export async function certificateInsurers(workspaceId: string, policy: Policy): Promise<CertificateInsurer[]> {
  const group = groupFor(policy.lineOfBusiness);
  if (!group) return [];
  const db = getDb();
  const layers = await db
    .select()
    .from(programLayers)
    .where(and(eq(programLayers.workspaceId, workspaceId), eq(programLayers.accountId, policy.accountId), eq(programLayers.lineGroup, group)))
    .orderBy(asc(programLayers.attachment));
  const layer = layers.find((l) => l.policyId === policy.id) ?? layers.find((l) => l.attachment === 0) ?? null;
  if (!layer) return [];
  const parts = await db.select().from(layerParticipations).where(inArray(layerParticipations.layerId, [layer.id])).orderBy(asc(layerParticipations.createdAt));
  if (parts.length <= 1) return parts.length === 1 && parts[0].insurer !== policy.carrier ? [{ name: parts[0].insurer, signedLinePct: parts[0].signedLinePct }] : [];
  return parts.map((p) => ({ name: p.insurer, signedLinePct: p.signedLinePct }));
}

export function toCertificatePolicy(p: Policy): CertificatePolicyInput {
  return {
    id: p.id,
    lineOfBusiness: p.lineOfBusiness,
    carrier: p.carrier,
    policyNumber: p.policyNumber,
    effectiveDate: p.effectiveDate,
    expiryDate: p.expiryDate,
    occurrenceLimit: p.occurrenceLimit,
    aggregateLimit: p.aggregateLimit,
    deductible: p.deductible,
    exposureBasis: p.exposureBasis,
    exposureAmount: p.exposureAmount,
    insurableValue: p.insurableValue,
    endorsements: p.endorsements,
  };
}
