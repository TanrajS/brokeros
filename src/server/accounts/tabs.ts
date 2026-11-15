import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { claims, documents, policies, programLayers, quoteOptions } from "@/server/db/schema";

export interface AccountTabCounts {
  claims: number;
  layers: number;
  documents: number;
  options: number;
}

/** Badge counts for the account tab strip. */
export async function accountTabCounts(workspaceId: string, accountId: string): Promise<AccountTabCounts> {
  const db = getDb();
  const [claimRows, layerRows, documentRows, optionRows] = await Promise.all([
    db.select({ id: claims.id }).from(claims).where(and(eq(claims.workspaceId, workspaceId), eq(claims.accountId, accountId))),
    db.select({ id: programLayers.id }).from(programLayers).where(and(eq(programLayers.workspaceId, workspaceId), eq(programLayers.accountId, accountId))),
    db.select({ id: documents.id }).from(documents).where(and(eq(documents.workspaceId, workspaceId), eq(documents.accountId, accountId))),
    db
      .select({ id: quoteOptions.id })
      .from(quoteOptions)
      .innerJoin(policies, eq(policies.id, quoteOptions.policyId))
      .where(and(eq(quoteOptions.workspaceId, workspaceId), eq(policies.accountId, accountId))),
  ]);
  return { claims: claimRows.length, layers: layerRows.length, documents: documentRows.length, options: optionRows.length };
}
