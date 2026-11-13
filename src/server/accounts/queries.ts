import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { accounts, contacts, policies, type Account, type Contact, type Policy } from "@/server/db/schema";
import { nextExpiry } from "@/lib/domain/book";
import { sumAmounts } from "@/lib/domain/money";
import type { ISODate } from "@/lib/domain/types";

export interface BookRow {
  id: string;
  name: string;
  industry: string;
  producer: string | null;
  status: Account["status"];
  policyCount: number;
  totalPremium: number;
  nextExpiry: ISODate | null;
  daysToExpiry: number | null;
}

export const BOOK_SORT_KEYS = ["name", "industry", "producer", "policyCount", "totalPremium", "nextExpiry"] as const;
export type BookSortKey = (typeof BOOK_SORT_KEYS)[number];

export interface BookQuery {
  q: string;
  sort: BookSortKey;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

export interface BookPage {
  rows: BookRow[];
  total: number;
  page: number;
  pageCount: number;
}

/**
 * The whole book is small (hundreds of accounts at most), so search, sort and
 * pagination happen in memory with the domain functions rather than in SQL.
 * That keeps "days to expiry" identical everywhere it is shown.
 */
export async function listBook(workspaceId: string, asOf: ISODate, query: BookQuery): Promise<BookPage> {
  const db = getDb();
  const [accountRows, policyRows] = await Promise.all([
    db.select().from(accounts).where(eq(accounts.workspaceId, workspaceId)).orderBy(asc(accounts.name)),
    db
      .select({
        id: policies.id,
        accountId: policies.accountId,
        expiryDate: policies.expiryDate,
        annualPremium: policies.annualPremium,
        previousPolicyId: policies.previousPolicyId,
      })
      .from(policies)
      .where(eq(policies.workspaceId, workspaceId)),
  ]);

  // v0.2: a renewed term stays on file for history but is superseded by its
  // successor, so the Book counts only current terms (no double premium).
  const superseded = new Set(policyRows.map((p) => p.previousPolicyId).filter((id): id is string => id !== null));

  const byAccount = new Map<string, { expiries: string[]; premiums: number[] }>();
  for (const p of policyRows) {
    if (superseded.has(p.id)) continue;
    const bucket = byAccount.get(p.accountId) ?? { expiries: [], premiums: [] };
    bucket.expiries.push(p.expiryDate);
    bucket.premiums.push(p.annualPremium);
    byAccount.set(p.accountId, bucket);
  }

  let rows: BookRow[] = accountRows.map((a) => {
    const bucket = byAccount.get(a.id) ?? { expiries: [], premiums: [] };
    const next = nextExpiry(asOf, bucket.expiries).value;
    return {
      id: a.id,
      name: a.name,
      industry: a.industry,
      producer: a.producer,
      status: a.status,
      policyCount: bucket.expiries.length,
      totalPremium: sumAmounts(bucket.premiums).value,
      nextExpiry: next.date,
      daysToExpiry: next.days,
    };
  });

  const q = query.q.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) =>
      [r.name, r.industry, r.producer ?? ""].some((field) => field.toLowerCase().includes(q)),
    );
  }

  const dir = query.dir === "desc" ? -1 : 1;
  rows.sort((a, b) => compareRows(a, b, query.sort) * dir);

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(Math.max(1, query.page), pageCount);
  const start = (page - 1) * query.pageSize;
  return { rows: rows.slice(start, start + query.pageSize), total, page, pageCount };
}

function compareRows(a: BookRow, b: BookRow, key: BookSortKey): number {
  switch (key) {
    case "name":
    case "industry":
      return a[key].localeCompare(b[key]);
    case "producer":
      return (a.producer ?? "").localeCompare(b.producer ?? "");
    case "policyCount":
    case "totalPremium":
      return a[key] - b[key];
    case "nextExpiry": {
      // Accounts without an expiry sort last in both directions-by-value terms; use a far-future sentinel.
      const av = a.nextExpiry ?? "9999-12-31";
      const bv = b.nextExpiry ?? "9999-12-31";
      return av.localeCompare(bv);
    }
  }
}

export interface AccountDetail {
  account: Account;
  contacts: Contact[];
  policies: Policy[];
}

export async function getAccountDetail(workspaceId: string, accountId: string): Promise<AccountDetail | null> {
  const db = getDb();
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, workspaceId)),
  });
  if (!account) return null;
  const [contactRows, policyRows] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.accountId, accountId)).orderBy(asc(contacts.name)),
    db.select().from(policies).where(eq(policies.accountId, accountId)).orderBy(asc(policies.expiryDate), asc(policies.lineOfBusiness)),
  ]);
  return { account, contacts: contactRows, policies: policyRows };
}

export async function getPolicy(workspaceId: string, policyId: string): Promise<Policy | null> {
  const db = getDb();
  const row = await db.query.policies.findFirst({
    where: and(eq(policies.id, policyId), eq(policies.workspaceId, workspaceId)),
  });
  return row ?? null;
}

/** Policies of the same account, for the "previous policy" picker. */
export async function listAccountPolicies(workspaceId: string, accountId: string): Promise<Policy[]> {
  const db = getDb();
  return db
    .select()
    .from(policies)
    .where(and(eq(policies.workspaceId, workspaceId), eq(policies.accountId, accountId)))
    .orderBy(asc(policies.expiryDate));
}
