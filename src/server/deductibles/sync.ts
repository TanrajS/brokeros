import "server-only";
import { and, eq } from "drizzle-orm";
import { policyCoverageParts } from "@/server/db/schema";
import type { Executor } from "@/server/db/tx";

export interface HeadlineTerms {
  deductible: number | null;
  occurrenceLimit: number | null;
  aggregateLimit: number | null;
}

/**
 * Keeps the policy's default (all other perils) coverage part equal to the
 * policy's own fields: deductible, occurrence limit and aggregate limit. The row
 * exists while any of the three is set and is removed when all are cleared.
 * Called by every policy write.
 */
export async function syncDefaultCoveragePart(db: Executor, workspaceId: string, policyId: string, terms: HeadlineTerms): Promise<void> {
  const [existing] = await db.select().from(policyCoverageParts).where(and(eq(policyCoverageParts.policyId, policyId), eq(policyCoverageParts.isDefault, true)));
  const empty = terms.deductible === null && terms.occurrenceLimit === null && terms.aggregateLimit === null;
  if (empty) {
    if (existing) await db.delete(policyCoverageParts).where(eq(policyCoverageParts.id, existing.id));
    return;
  }
  if (existing) {
    const changed = existing.amount !== terms.deductible || existing.kind !== "flat" || existing.occurrenceLimit !== terms.occurrenceLimit || existing.aggregateLimit !== terms.aggregateLimit;
    if (changed) {
      await db
        .update(policyCoverageParts)
        .set({ kind: "flat", amount: terms.deductible, percent: null, minimum: null, maximum: null, hours: null, occurrenceLimit: terms.occurrenceLimit, aggregateLimit: terms.aggregateLimit, updatedAt: new Date() })
        .where(eq(policyCoverageParts.id, existing.id));
    }
    return;
  }
  await db.insert(policyCoverageParts).values({ workspaceId, policyId, appliesTo: "All other perils", kind: "flat", amount: terms.deductible, occurrenceLimit: terms.occurrenceLimit, aggregateLimit: terms.aggregateLimit, isDefault: true });
}
