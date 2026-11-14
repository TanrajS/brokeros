import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { LRClaim, LRPolicy } from "@/lib/domain/lossRuns";
import type { RetentionOption } from "@/lib/domain/strategy";
import { getDb } from "@/server/db/client";
import { quoteOptions, type QuoteOption, type Workspace } from "@/server/db/schema";
import { loadLossRunInputs } from "@/server/lossRuns/queries";
import { loadMarketingInputs } from "@/server/marketing/queries";

export function toRetentionOption(o: QuoteOption): RetentionOption {
  return { id: o.id, label: o.label, carrier: o.carrier, deductible: o.deductible, aggregateCap: o.aggregateCap, premium: o.premium };
}

export type StrategyInputs = NonNullable<Awaited<ReturnType<typeof loadMarketingInputs>>> & {
  lrPolicies: LRPolicy[];
  claims: LRClaim[];
  options: QuoteOption[];
};

/** Everything the Strategy tab and the report need: policies, submissions and quotes, claims, and the retention options. */
export async function loadStrategyInputs(ws: Workspace, accountId: string): Promise<StrategyInputs | null> {
  const [marketing, losses] = await Promise.all([loadMarketingInputs(ws, accountId), loadLossRunInputs(ws, accountId)]);
  if (!marketing || !losses) return null;
  const ids = marketing.policies.map((p) => p.id);
  const options = ids.length
    ? await getDb()
        .select()
        .from(quoteOptions)
        .where(and(eq(quoteOptions.workspaceId, ws.id), inArray(quoteOptions.policyId, ids)))
        .orderBy(asc(quoteOptions.deductible), asc(quoteOptions.premium))
    : [];
  return { ...marketing, lrPolicies: losses.policies, claims: losses.claims, options };
}
