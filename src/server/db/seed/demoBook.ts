/**
 * Writes the fictional demo book into a workspace.
 * Used by `npm run db:seed` and by the Settings "Load demo book" action.
 */
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { ISODate } from "@/lib/domain/types";
import * as schema from "../schema";
import { buildDemoBook, type DemoAccount } from "./demoBookData";

type AnyDb = NeonHttpDatabase<typeof schema>;

export { buildDemoBook, DEMO_WORKSPACE_NAME } from "./demoBookData";

export interface SeedSummary {
  accounts: number;
  contacts: number;
  policies: number;
}

/** Inserts the demo book into an (assumed empty) workspace. Returns row counts. */
export async function loadDemoBook(db: AnyDb, workspaceId: string, asOf: ISODate): Promise<SeedSummary> {
  const book = buildDemoBook(asOf);
  return insertBook(db, workspaceId, book);
}

async function insertBook(db: AnyDb, workspaceId: string, book: DemoAccount[]): Promise<SeedSummary> {
  const insertedAccounts = await db
    .insert(schema.accounts)
    .values(
      book.map((a) => ({
        workspaceId,
        name: a.name,
        industry: a.industry,
        annualRevenue: a.annualRevenue,
        employeeCount: a.employeeCount,
        province: a.province,
        producer: a.producer,
        accountManager: a.accountManager,
        status: a.status,
        notes: a.notes,
      })),
    )
    .returning({ id: schema.accounts.id, name: schema.accounts.name });

  const idByName = new Map(insertedAccounts.map((a) => [a.name, a.id]));

  const contactRows = book.flatMap((a) =>
    a.contacts.map((c) => ({
      workspaceId,
      accountId: idByName.get(a.name)!,
      name: c.name,
      role: c.role,
      email: c.email,
      phone: c.phone,
    })),
  );
  if (contactRows.length > 0) await db.insert(schema.contacts).values(contactRows);

  const policyRows = book.flatMap((a) =>
    a.policies.map((p) => ({
      workspaceId,
      accountId: idByName.get(a.name)!,
      carrier: p.carrier,
      lineOfBusiness: p.lineOfBusiness,
      policyNumber: p.policyNumber,
      effectiveDate: p.effectiveDate,
      expiryDate: p.expiryDate,
      occurrenceLimit: p.occurrenceLimit,
      aggregateLimit: p.aggregateLimit,
      deductible: p.deductible,
      annualPremium: p.annualPremium,
      commissionRate: p.commissionRate,
      exposureBasis: p.exposureBasis,
      exposureAmount: p.exposureAmount,
      endorsements: p.endorsements,
      renewalStatus: p.renewalStatus,
      notes: p.notes,
    })),
  );
  if (policyRows.length > 0) await db.insert(schema.policies).values(policyRows);

  return { accounts: insertedAccounts.length, contacts: contactRows.length, policies: policyRows.length };
}
