import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { CoveragePart } from "@/lib/domain/deductibles";
import { getDb } from "@/server/db/client";
import { policyCoverageParts, type PolicyCoveragePart } from "@/server/db/schema";

export function toRule(d: PolicyCoveragePart): CoveragePart {
  return { id: d.id, appliesTo: d.appliesTo, kind: d.kind, amount: d.amount, percent: d.percent, minimum: d.minimum, maximum: d.maximum, hours: d.hours, notes: d.notes, isDefault: d.isDefault, occurrenceLimit: d.occurrenceLimit, aggregateLimit: d.aggregateLimit };
}

/** A policy's coverage schedule, default part first, then by peril. */
export async function listPolicyDeductibles(workspaceId: string, policyId: string): Promise<PolicyCoveragePart[]> {
  return getDb()
    .select()
    .from(policyCoverageParts)
    .where(and(eq(policyCoverageParts.workspaceId, workspaceId), eq(policyCoverageParts.policyId, policyId)))
    .orderBy(desc(policyCoverageParts.isDefault), asc(policyCoverageParts.appliesTo));
}

/** A compact coverage part for the "N coverage parts" chip and its tooltip. */
export interface CoveragePartSummary {
  appliesTo: string;
  isDefault: boolean;
  deductible: string;
  occurrenceLimit: number | null;
  aggregateLimit: number | null;
}

/** Every policy's coverage parts (default first), for the chips on the Overview table. */
export async function listCoveragePartsFor(workspaceId: string, policyIds: string[]): Promise<Map<string, PolicyCoveragePart[]>> {
  if (policyIds.length === 0) return new Map();
  const rows = await getDb()
    .select()
    .from(policyCoverageParts)
    .where(and(eq(policyCoverageParts.workspaceId, workspaceId), inArray(policyCoverageParts.policyId, policyIds)))
    .orderBy(desc(policyCoverageParts.isDefault), asc(policyCoverageParts.appliesTo));
  const out = new Map<string, PolicyCoveragePart[]>();
  for (const r of rows) out.set(r.policyId, [...(out.get(r.policyId) ?? []), r]);
  return out;
}
