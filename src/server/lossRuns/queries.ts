import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { LRClaim, LRPolicy } from "@/lib/domain/lossRuns";
import { getDb } from "@/server/db/client";
import { accounts, claims, policies, type Account, type Workspace } from "@/server/db/schema";

export interface LossRunInputs {
  account: Account;
  policies: LRPolicy[];
  claims: LRClaim[];
}

/** Every policy (all lines) and every claim on the account, mapped to the loss-run domain shapes. */
export async function loadLossRunInputs(ws: Workspace, accountId: string): Promise<LossRunInputs | null> {
  const db = getDb();
  const account = await db.query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) });
  if (!account) return null;
  const [policyRows, claimRows] = await Promise.all([
    db
      .select()
      .from(policies)
      .where(and(eq(policies.workspaceId, ws.id), eq(policies.accountId, accountId)))
      .orderBy(asc(policies.effectiveDate)),
    db
      .select()
      .from(claims)
      .where(and(eq(claims.workspaceId, ws.id), eq(claims.accountId, accountId)))
      .orderBy(asc(claims.dateOfLoss), asc(claims.claimNumber)),
  ]);
  return {
    account,
    policies: policyRows.map((p) => ({
      id: p.id,
      lineOfBusiness: p.lineOfBusiness,
      effectiveDate: p.effectiveDate,
      expiryDate: p.expiryDate,
      annualPremium: p.annualPremium,
      exposureBasis: p.exposureBasis,
      exposureAmount: p.exposureAmount,
      previousPolicyId: p.previousPolicyId,
    })),
    claims: claimRows.map((c) => ({
      id: c.id,
      lineOfBusiness: c.lineOfBusiness,
      claimNumber: c.claimNumber,
      dateOfLoss: c.dateOfLoss,
      dateReported: c.dateReported,
      description: c.description,
      paid: c.paid,
      reserved: c.reserved,
      status: c.status,
      policyId: c.policyId,
    })),
  };
}

export async function countAccountClaims(workspaceId: string, accountId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: claims.id })
    .from(claims)
    .where(and(eq(claims.workspaceId, workspaceId), eq(claims.accountId, accountId)));
  return rows.length;
}

export interface PlacementAccountRow {
  id: string;
  name: string;
  industry: string;
  producer: string | null;
  lines: string[];
  claimCount: number;
}

/** Accounts for the Placement picker, with their lines and claim counts. */
export async function listPlacementAccounts(workspaceId: string): Promise<PlacementAccountRow[]> {
  const db = getDb();
  const [accountRows, policyRows, claimRows] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.workspaceId, workspaceId)).orderBy(asc(accounts.name)),
    db.select({ accountId: policies.accountId, line: policies.lineOfBusiness }).from(policies).where(eq(policies.workspaceId, workspaceId)),
    db.select({ accountId: claims.accountId }).from(claims).where(eq(claims.workspaceId, workspaceId)),
  ]);
  return accountRows.map((a) => ({
    id: a.id,
    name: a.name,
    industry: a.industry,
    producer: a.producer,
    lines: [...new Set(policyRows.filter((p) => p.accountId === a.id).map((p) => p.line))].sort(),
    claimCount: claimRows.filter((c) => c.accountId === a.id).length,
  }));
}
