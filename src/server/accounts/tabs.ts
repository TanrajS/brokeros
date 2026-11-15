import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { claims, programLayers, quoteOptions, quotes, submissions } from "@/server/db/schema";

export interface AccountTabCounts {
  claims: number;
  layers: number;
  quotes: number;
  options: number;
}

/** Badge counts for the account tab strip. */
export async function accountTabCounts(workspaceId: string, accountId: string): Promise<AccountTabCounts> {
  const db = getDb();
  const [claimRows, layerRows, submissionRows, optionRows] = await Promise.all([
    db.select({ id: claims.id }).from(claims).where(and(eq(claims.workspaceId, workspaceId), eq(claims.accountId, accountId))),
    db.select({ id: programLayers.id }).from(programLayers).where(and(eq(programLayers.workspaceId, workspaceId), eq(programLayers.accountId, accountId))),
    db.select({ id: submissions.id }).from(submissions).where(and(eq(submissions.workspaceId, workspaceId), eq(submissions.accountId, accountId))),
    db
      .select({ id: quoteOptions.id })
      .from(quoteOptions)
      .innerJoin(submissions, eq(submissions.policyId, quoteOptions.policyId))
      .where(and(eq(quoteOptions.workspaceId, workspaceId), eq(submissions.accountId, accountId))),
  ]);
  const quoteRows = submissionRows.length ? await db.select({ id: quotes.id }).from(quotes).where(inArray(quotes.submissionId, submissionRows.map((s) => s.id))) : [];
  return { claims: claimRows.length, layers: layerRows.length, quotes: quoteRows.length, options: new Set(optionRows.map((o) => o.id)).size };
}
