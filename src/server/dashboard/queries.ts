import "server-only";
import { count, eq, sql } from "drizzle-orm";
import type { DashAccount, DashPolicy } from "@/lib/domain/dashboard";
import { checklistTemplate } from "@/lib/domain/renewals";
import { getDb } from "@/server/db/client";
import { accounts, checklistItems, policies, renewalOutcomes, type Workspace } from "@/server/db/schema";

export interface DashboardInputs {
  accounts: DashAccount[];
  policies: DashPolicy[];
  producers: string[];
}

/** Fetches rows and maps them to the plain shapes the dashboard domain functions take. */
export async function loadDashboardInputs(ws: Workspace): Promise<DashboardInputs> {
  const db = getDb();
  const [accountRows, policyRows, checklistRows] = await Promise.all([
    db.select({ id: accounts.id, name: accounts.name, producer: accounts.producer }).from(accounts).where(eq(accounts.workspaceId, ws.id)),
    db
      .select({ policy: policies, outcome: renewalOutcomes })
      .from(policies)
      .leftJoin(renewalOutcomes, eq(renewalOutcomes.policyId, policies.id))
      .where(eq(policies.workspaceId, ws.id)),
    db
      .select({
        policyId: checklistItems.policyId,
        total: count(),
        done: sql<number>`count(*) filter (where ${checklistItems.done})`.mapWith(Number),
      })
      .from(checklistItems)
      .where(eq(checklistItems.workspaceId, ws.id))
      .groupBy(checklistItems.policyId),
  ]);

  const checklist = new Map(checklistRows.map((c) => [c.policyId, { done: c.done, total: c.total }]));
  const dashPolicies: DashPolicy[] = policyRows.map(({ policy: p, outcome: o }) => ({
    id: p.id,
    accountId: p.accountId,
    lineOfBusiness: p.lineOfBusiness,
    carrier: p.carrier,
    effectiveDate: p.effectiveDate,
    expiryDate: p.expiryDate,
    annualPremium: p.annualPremium,
    commissionRate: p.commissionRate,
    renewalStatus: p.renewalStatus,
    outcome: o
      ? { type: o.outcome, lostReason: o.lostReason, reason: o.reason, competingPremium: o.competingPremium, successorPolicyId: o.successorPolicyId }
      : null,
    checklist: checklist.get(p.id) ?? { done: 0, total: checklistTemplate(p.lineOfBusiness).value.length },
  }));

  const producers = [...new Set(accountRows.map((a) => a.producer).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
  return { accounts: accountRows, policies: dashPolicies, producers };
}
