import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { accounts, contacts, policies, type Workspace } from "@/server/db/schema";
import { APP_VERSION } from "@/lib/constants";
import { toCsv } from "@/lib/format/csv";

/** Whole-workspace export. Ids are included so a future import can rebuild links. */
export async function exportWorkspaceJson(ws: Workspace) {
  const db = getDb();
  const [accountRows, contactRows, policyRows] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.workspaceId, ws.id)).orderBy(asc(accounts.name)),
    db.select().from(contacts).where(eq(contacts.workspaceId, ws.id)).orderBy(asc(contacts.name)),
    db.select().from(policies).where(eq(policies.workspaceId, ws.id)).orderBy(asc(policies.expiryDate)),
  ]);
  return {
    format: "brokeros-workspace",
    version: APP_VERSION,
    workspace: { id: ws.id, slug: ws.slug, name: ws.name, asOfDate: ws.asOfDate, createdAt: ws.createdAt, updatedAt: ws.updatedAt },
    accounts: accountRows,
    contacts: contactRows,
    policies: policyRows,
  };
}

export async function exportAccountsCsv(ws: Workspace): Promise<string> {
  const db = getDb();
  const rows = await db.select().from(accounts).where(eq(accounts.workspaceId, ws.id)).orderBy(asc(accounts.name));
  return toCsv(
    ["id", "name", "industry", "annual_revenue", "employee_count", "province", "producer", "account_manager", "status", "notes", "created_at", "updated_at"],
    rows.map((a) => [a.id, a.name, a.industry, a.annualRevenue, a.employeeCount, a.province, a.producer, a.accountManager, a.status, a.notes, a.createdAt.toISOString(), a.updatedAt.toISOString()]),
  );
}

export async function exportPoliciesCsv(ws: Workspace): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({ policy: policies, accountName: accounts.name })
    .from(policies)
    .innerJoin(accounts, eq(accounts.id, policies.accountId))
    .where(eq(policies.workspaceId, ws.id))
    .orderBy(asc(accounts.name), asc(policies.expiryDate));
  return toCsv(
    [
      "id", "account_id", "account_name", "carrier", "line_of_business", "policy_number", "effective_date", "expiry_date",
      "occurrence_limit", "aggregate_limit", "deductible", "annual_premium", "commission_rate", "exposure_basis", "exposure_amount",
      "endorsements", "renewal_status", "previous_policy_id", "notes", "created_at", "updated_at",
    ],
    rows.map(({ policy: p, accountName }) => [
      p.id, p.accountId, accountName, p.carrier, p.lineOfBusiness, p.policyNumber, p.effectiveDate, p.expiryDate,
      p.occurrenceLimit, p.aggregateLimit, p.deductible, p.annualPremium, p.commissionRate, p.exposureBasis, p.exposureAmount,
      p.endorsements.join("|"), p.renewalStatus, p.previousPolicyId, p.notes, p.createdAt.toISOString(), p.updatedAt.toISOString(),
    ]),
  );
}
