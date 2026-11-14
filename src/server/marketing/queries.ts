import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { ExpiringTerms, MarketSubmission, QuoteInput } from "@/lib/domain/marketing";
import { getDb } from "@/server/db/client";
import { accounts, checklistItems, contractRequirements, policies, quotes, renewalOutcomes, submissions, type Policy, type Quote, type Submission, type Workspace } from "@/server/db/schema";

export function toExpiringTerms(p: Policy): ExpiringTerms {
  return {
    carrier: p.carrier,
    premium: p.annualPremium,
    exposureAmount: p.exposureAmount,
    exposureBasis: p.exposureBasis,
    occurrenceLimit: p.occurrenceLimit,
    aggregateLimit: p.aggregateLimit,
    deductible: p.deductible,
    endorsements: p.endorsements,
    commissionRate: p.commissionRate,
  };
}

export function toQuoteInput(q: Quote, carrier: string): QuoteInput {
  return {
    id: q.id,
    carrier,
    premium: q.quotedPremium,
    occurrenceLimit: q.occurrenceLimit,
    aggregateLimit: q.aggregateLimit,
    deductible: q.deductible,
    endorsements: q.endorsements,
    commissionRate: q.commissionRate,
    exposureAmount: q.exposureAmount,
    validUntil: q.validUntil,
    isIncumbent: q.isIncumbentRenewal,
  };
}

export interface SubmissionWithQuotes {
  submission: Submission;
  quotes: Quote[];
}

/** Policies on the account, their outcomes, every submission and quote, and the account's contract requirements. */
export async function loadMarketingInputs(ws: Workspace, accountId: string) {
  const db = getDb();
  const account = await db.query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) });
  if (!account) return null;
  const [policyRows, submissionRows, requirementRows] = await Promise.all([
    db.select().from(policies).where(and(eq(policies.workspaceId, ws.id), eq(policies.accountId, accountId))).orderBy(asc(policies.expiryDate)),
    db.select().from(submissions).where(and(eq(submissions.workspaceId, ws.id), eq(submissions.accountId, accountId))).orderBy(asc(submissions.sentOn), asc(submissions.carrier)),
    db.select().from(contractRequirements).where(and(eq(contractRequirements.workspaceId, ws.id), eq(contractRequirements.accountId, accountId))).orderBy(asc(contractRequirements.contractName)),
  ]);
  const ids = policyRows.map((p) => p.id);
  const [quoteRows, outcomeRows] = await Promise.all([
    submissionRows.length ? db.select().from(quotes).where(inArray(quotes.submissionId, submissionRows.map((s) => s.id))).orderBy(asc(quotes.quotedPremium)) : Promise.resolve([] as Quote[]),
    ids.length ? db.select({ policyId: renewalOutcomes.policyId }).from(renewalOutcomes).where(inArray(renewalOutcomes.policyId, ids)) : Promise.resolve([]),
  ]);
  const byPolicy = new Map<string, SubmissionWithQuotes[]>();
  for (const s of submissionRows) {
    byPolicy.set(s.policyId, [...(byPolicy.get(s.policyId) ?? []), { submission: s, quotes: quoteRows.filter((q) => q.submissionId === s.id) }]);
  }
  return { account, policies: policyRows, outcomes: new Set(outcomeRows.map((o) => o.policyId)), byPolicy, requirements: requirementRows };
}

/** The policy's checklist as stored; empty when it has not been opened yet. */
export async function loadChecklist(workspaceId: string, policyId: string) {
  return getDb()
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.workspaceId, workspaceId), eq(checklistItems.policyId, policyId)))
    .orderBy(asc(checklistItems.sortOrder));
}

/** The bound quote on a policy (with its carrier), used to prefill the Renewed outcome form. */
export async function boundQuoteForPolicy(workspaceId: string, policyId: string): Promise<{ quote: Quote; carrier: string } | null> {
  const rows = await getDb()
    .select({ quote: quotes, carrier: submissions.carrier })
    .from(quotes)
    .innerJoin(submissions, eq(submissions.id, quotes.submissionId))
    .where(and(eq(submissions.workspaceId, workspaceId), eq(submissions.policyId, policyId), eq(quotes.isBound, true)));
  return rows[0] ?? null;
}

/** Every submission in the workspace (optionally only these accounts), shaped for the market log. */
export async function listMarketSubmissions(ws: Workspace, accountIds?: string[]): Promise<(MarketSubmission & { accountName: string })[]> {
  const db = getDb();
  const where = accountIds ? and(eq(submissions.workspaceId, ws.id), inArray(submissions.accountId, accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"])) : eq(submissions.workspaceId, ws.id);
  const [rows, quoteRows, accountRows] = await Promise.all([
    db.select().from(submissions).where(where),
    db.select({ submissionId: quotes.submissionId }).from(quotes).where(eq(quotes.workspaceId, ws.id)),
    db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.workspaceId, ws.id)),
  ]);
  const counts = new Map<string, number>();
  for (const q of quoteRows) counts.set(q.submissionId, (counts.get(q.submissionId) ?? 0) + 1);
  const names = new Map(accountRows.map((a) => [a.id, a.name]));
  return rows.map((s) => ({
    id: s.id,
    carrier: s.carrier,
    sentOn: s.sentOn,
    respondedOn: s.respondedOn,
    status: s.status,
    declineReason: s.declinedReason,
    quoteCount: counts.get(s.id) ?? 0,
    accountName: names.get(s.accountId) ?? "Unknown account",
  }));
}
