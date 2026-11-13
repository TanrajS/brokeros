import "server-only";
import { asc, count, eq } from "drizzle-orm";
import type { LineOfBusiness } from "@/lib/constants";
import { checklistTemplate } from "@/lib/domain/renewals";
import { checklistItems, type ChecklistItem } from "@/server/db/schema";
import type { Executor } from "@/server/db/tx";

/**
 * Generates the standard checklist the first time a policy is opened.
 * Idempotent: does nothing when the policy already has items, and the unique
 * (policy, label) index makes a concurrent double-run harmless.
 */
export async function ensureChecklist(
  db: Executor,
  policy: { id: string; workspaceId: string; lineOfBusiness: LineOfBusiness },
): Promise<ChecklistItem[]> {
  const [{ n }] = await db.select({ n: count() }).from(checklistItems).where(eq(checklistItems.policyId, policy.id));
  if (n === 0) {
    const template = checklistTemplate(policy.lineOfBusiness).value;
    await db
      .insert(checklistItems)
      .values(
        template.map((t, i) => ({
          workspaceId: policy.workspaceId,
          policyId: policy.id,
          label: t.label,
          required: t.required,
          done: false,
          source: t.source,
          sortOrder: i,
        })),
      )
      .onConflictDoNothing();
  }
  return db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.policyId, policy.id))
    .orderBy(asc(checklistItems.sortOrder), asc(checklistItems.createdAt));
}
