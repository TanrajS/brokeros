import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { DeductibleRule } from "@/lib/domain/deductibles";
import { getDb } from "@/server/db/client";
import { policyDeductibles, type PolicyDeductible } from "@/server/db/schema";

export function toRule(d: PolicyDeductible): DeductibleRule {
  return { id: d.id, appliesTo: d.appliesTo, kind: d.kind, amount: d.amount, percent: d.percent, minimum: d.minimum, maximum: d.maximum, hours: d.hours, notes: d.notes, isDefault: d.isDefault };
}

/** A policy's schedule, default row first, then by peril. */
export async function listPolicyDeductibles(workspaceId: string, policyId: string): Promise<PolicyDeductible[]> {
  return getDb()
    .select()
    .from(policyDeductibles)
    .where(and(eq(policyDeductibles.workspaceId, workspaceId), eq(policyDeductibles.policyId, policyId)))
    .orderBy(desc(policyDeductibles.isDefault), asc(policyDeductibles.appliesTo));
}

/** Schedule row counts per policy, for the "N deductibles" chip. */
export async function countDeductibles(workspaceId: string, policyIds: string[]): Promise<Map<string, number>> {
  if (policyIds.length === 0) return new Map();
  const rows = await getDb().select({ policyId: policyDeductibles.policyId }).from(policyDeductibles).where(and(eq(policyDeductibles.workspaceId, workspaceId), inArray(policyDeductibles.policyId, policyIds)));
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.policyId, (out.get(r.policyId) ?? 0) + 1);
  return out;
}
