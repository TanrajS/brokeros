import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { daysBetween } from "@/lib/domain/dates";
import { getRenewalStage } from "@/lib/domain/renewals";
import { policies } from "@/server/db/schema";
import type { Executor } from "@/server/db/tx";
import { logActivities, policyLabel, type ActivityEntry } from "./activityLog";

/**
 * Recomputes every policy's stage from the workspace as-of date and logs an
 * activity for each one that moved since it was last logged. Policies that have
 * never been logged (new, or seeded) are initialised silently.
 *
 * Call after anything that can move a stage: changing the as-of date, adding or
 * editing a policy, and recording or undoing an outcome.
 */
export async function syncStages(db: Executor, workspaceId: string, asOf: string, onlyPolicyIds?: string[]): Promise<number> {
  const rows = await db
    .select({
      id: policies.id,
      accountId: policies.accountId,
      lineOfBusiness: policies.lineOfBusiness,
      carrier: policies.carrier,
      expiryDate: policies.expiryDate,
      renewalStatus: policies.renewalStatus,
      lastLoggedStage: policies.lastLoggedStage,
    })
    .from(policies)
    .where(eq(policies.workspaceId, workspaceId));

  const scope = onlyPolicyIds ? new Set(onlyPolicyIds) : null;
  const entries: ActivityEntry[] = [];
  const idsByStage = new Map<string, string[]>();
  let changed = 0;
  for (const p of rows) {
    if (scope && !scope.has(p.id)) continue;
    const stage = getRenewalStage(daysBetween(asOf, p.expiryDate).value, p.renewalStatus).value;
    if (stage === p.lastLoggedStage) continue;
    if (p.lastLoggedStage !== null) {
      entries.push({
        workspaceId,
        accountId: p.accountId,
        policyId: p.id,
        kind: "stage_change",
        body: `${policyLabel(p)} moved from ${p.lastLoggedStage} to ${stage}.`,
        asOfDate: asOf,
      });
      changed += 1;
    }
    idsByStage.set(stage, [...(idsByStage.get(stage) ?? []), p.id]);
  }
  // One update per stage (at most seven), not one per policy.
  for (const [stage, ids] of idsByStage) {
    await db
      .update(policies)
      .set({ lastLoggedStage: stage })
      .where(and(eq(policies.workspaceId, workspaceId), inArray(policies.id, ids)));
  }
  await logActivities(db, entries);
  return changed;
}
