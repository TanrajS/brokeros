import "server-only";
import { eq } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/server/db/schema";
import { loadDemoBook } from "@/server/db/seed/demoBook";
import { deleteUserBlobs } from "@/server/documents/cleanup";

/**
 * Empties a workspace (accounts cascade to everything beneath them, document
 * rows included) and reloads the demo book. Files uploaded by users are deleted
 * from Blob first; seed documents point at the shared `seed/` blobs, which are
 * reused, never re-uploaded.
 */
export async function resetDemoWorkspace(db: NeonHttpDatabase<typeof schema>, ws: schema.Workspace): Promise<{ accounts: number; policies: number; documents: number }> {
  await deleteUserBlobs(db, ws.id);
  await db.delete(schema.accounts).where(eq(schema.accounts.workspaceId, ws.id));
  const summary = await loadDemoBook(db, ws.id, ws.asOfDate);
  return { accounts: summary.accounts, policies: summary.policies, documents: summary.documents };
}
