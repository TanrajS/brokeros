import { and, eq } from "drizzle-orm";
import type { Executor } from "@/server/db/tx";
import { documents } from "@/server/db/schema";
import { blobReady, deleteBlob } from "./blob";

/**
 * Deletes the blobs of every user-uploaded document (`is_seed = false`) in a
 * workspace, or in one of its accounts, before the rows go with their account.
 * Seed documents point at the shared `seed/` files and are left alone. Best
 * effort: a blob that is already gone does not stop the delete.
 */
export async function deleteUserBlobs(executor: Executor, workspaceId: string, accountId?: string): Promise<number> {
  if (!blobReady()) return 0;
  const where = accountId ? and(eq(documents.workspaceId, workspaceId), eq(documents.accountId, accountId), eq(documents.isSeed, false)) : and(eq(documents.workspaceId, workspaceId), eq(documents.isSeed, false));
  const rows = await executor.select({ url: documents.fileUrl }).from(documents).where(where);
  let n = 0;
  for (const r of rows) {
    try {
      await deleteBlob(r.url);
      n++;
    } catch (err) {
      console.error("[brokeros] blob delete skipped:", err instanceof Error ? err.message : err);
    }
  }
  return n;
}
