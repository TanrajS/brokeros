import { notFound, redirect } from "next/navigation";
import type { Workspace } from "@/server/db/schema";
import { DatabaseUnavailableError, getWorkspaceBySlug } from "@/server/workspace/queries";

/** Resolves the workspace for a page, redirecting to setup or 404 as needed. */
export async function requireWorkspace(slug: string): Promise<Workspace> {
  let ws: Workspace | null;
  try {
    ws = await getWorkspaceBySlug(slug);
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) redirect("/setup?reason=unreachable");
    throw err;
  }
  if (!ws) notFound();
  return ws;
}
