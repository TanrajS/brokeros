import "server-only";
import { and, eq } from "drizzle-orm";
import { policyDeductibles } from "@/server/db/schema";
import type { Executor } from "@/server/db/tx";

/**
 * Keeps the policy's default (all other perils) schedule row equal to
 * `policies.deductible`: upserts the flat row when the deductible is set and
 * removes it when the deductible is cleared. Called by every policy write.
 */
export async function syncDefaultDeductible(db: Executor, workspaceId: string, policyId: string, deductible: number | null): Promise<void> {
  const [existing] = await db.select().from(policyDeductibles).where(and(eq(policyDeductibles.policyId, policyId), eq(policyDeductibles.isDefault, true)));
  if (deductible === null) {
    if (existing) await db.delete(policyDeductibles).where(eq(policyDeductibles.id, existing.id));
    return;
  }
  if (existing) {
    if (existing.amount !== deductible || existing.kind !== "flat") await db.update(policyDeductibles).set({ kind: "flat", amount: deductible, percent: null, minimum: null, maximum: null, hours: null, updatedAt: new Date() }).where(eq(policyDeductibles.id, existing.id));
    return;
  }
  await db.insert(policyDeductibles).values({ workspaceId, policyId, appliesTo: "All other perils", kind: "flat", amount: deductible, isDefault: true });
}
