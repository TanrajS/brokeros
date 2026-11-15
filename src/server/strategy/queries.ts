import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { LRClaim, LRPolicy } from "@/lib/domain/lossRuns";
import type { RetentionOption } from "@/lib/domain/strategy";
import { getDb } from "@/server/db/client";
import { accounts, policies, quoteOptions, renewalOutcomes, type Account, type Policy, type QuoteOption, type Workspace } from "@/server/db/schema";
import { loadLossRunInputs } from "@/server/lossRuns/queries";
import { loadProgramLayers } from "@/server/program/queries";

export function toRetentionOption(o: QuoteOption): RetentionOption {
  return { id: o.id, label: o.label, carrier: o.carrier, deductible: o.deductible, aggregateCap: o.aggregateCap, premium: o.premium };
}

export interface StrategyInputs {
  account: Account;
  policies: Policy[];
  outcomes: Set<string>;
  lrPolicies: LRPolicy[];
  claims: LRClaim[];
  options: QuoteOption[];
  program: Awaited<ReturnType<typeof loadProgramLayers>>;
}

/** Everything the Strategy tab and the report need: policies and outcomes, claims, the program layers and the manual retention options. */
export async function loadStrategyInputs(ws: Workspace, accountId: string): Promise<StrategyInputs | null> {
  const db = getDb();
  const account = await db.query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) });
  if (!account) return null;
  const [policyRows, losses, program] = await Promise.all([
    db.select().from(policies).where(and(eq(policies.workspaceId, ws.id), eq(policies.accountId, accountId))).orderBy(asc(policies.expiryDate)),
    loadLossRunInputs(ws, accountId),
    loadProgramLayers(ws.id, accountId),
  ]);
  if (!losses) return null;
  const ids = policyRows.map((p) => p.id);
  const [outcomeRows, options] = await Promise.all([
    ids.length ? db.select({ policyId: renewalOutcomes.policyId }).from(renewalOutcomes).where(inArray(renewalOutcomes.policyId, ids)) : Promise.resolve([]),
    ids.length ? db.select().from(quoteOptions).where(and(eq(quoteOptions.workspaceId, ws.id), inArray(quoteOptions.policyId, ids))).orderBy(asc(quoteOptions.deductible), asc(quoteOptions.premium)) : Promise.resolve([] as QuoteOption[]),
  ]);
  return { account, policies: policyRows, outcomes: new Set(outcomeRows.map((o) => o.policyId)), lrPolicies: losses.policies, claims: losses.claims, options, program };
}
