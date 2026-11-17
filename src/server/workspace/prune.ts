import { and, eq, inArray } from "drizzle-orm";
import { isRetiredDemoAccountName } from "@/lib/domain/book";
import { accounts } from "@/server/db/schema";
import type { Executor } from "@/server/db/tx";
import { deleteUserBlobs } from "@/server/documents/cleanup";

export interface PruneResult {
  removed: number;
  /** Per account name, how many rows went. */
  byName: Record<string, number>;
  /** Per workspace id, how many rows went. */
  byWorkspace: Record<string, number>;
}

/**
 * Removes the demo accounts retired in v1.4 (names starting with Ashgrove,
 * Kestrel, Prairie, Bluewater, Copperfield, Maple or Tidewater) from one
 * workspace, or from every workspace when `workspaceId` is null. Only rows the
 * seed wrote (`is_seed = true`) are ever deleted; a user's own account with one
 * of those names is left alone. Contacts, policies, claims, layers,
 * participations, coverage parts, documents, tasks and activities cascade at the
 * database; uploaded files are removed first because blobs do not cascade.
 */
export async function pruneRetiredDemoAccounts(db: Executor, workspaceId: string | null): Promise<PruneResult> {
  const candidates = await db
    .select({ id: accounts.id, name: accounts.name, workspaceId: accounts.workspaceId })
    .from(accounts)
    .where(workspaceId ? and(eq(accounts.isSeed, true), eq(accounts.workspaceId, workspaceId)) : eq(accounts.isSeed, true));
  const retired = candidates.filter((a) => isRetiredDemoAccountName(a.name));
  const byName: Record<string, number> = {};
  const byWorkspace: Record<string, number> = {};
  for (const a of retired) {
    byName[a.name] = (byName[a.name] ?? 0) + 1;
    byWorkspace[a.workspaceId] = (byWorkspace[a.workspaceId] ?? 0) + 1;
  }
  for (const a of retired) await deleteUserBlobs(db, a.workspaceId, a.id);
  const ids = retired.map((a) => a.id);
  for (let i = 0; i < ids.length; i += 200) {
    await db.delete(accounts).where(and(eq(accounts.isSeed, true), inArray(accounts.id, ids.slice(i, i + 200))));
  }
  return { removed: retired.length, byName, byWorkspace };
}
