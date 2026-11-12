import { connection, NextResponse, type NextRequest } from "next/server";
import { isDatabaseConfigured } from "@/server/db/client";
import { readWorkspaceCookie } from "@/server/workspace/cookie";
import { getWorkspaceById } from "@/server/workspace/queries";

/**
 * GET / — the entry point. Sends the visitor to the workspace remembered in
 * their cookie, or to /enter to create a fresh one. A route handler rather than
 * a page so the redirect is a real HTTP redirect, not a streamed one.
 */
export async function GET(request: NextRequest) {
  await connection();
  const go = (path: string) => NextResponse.redirect(new URL(path, request.url), 303);

  if (!isDatabaseConfigured()) return go("/setup?reason=missing");

  const workspaceId = await readWorkspaceCookie();
  if (!workspaceId) return go("/enter");
  try {
    const ws = await getWorkspaceById(workspaceId);
    return go(ws ? `/w/${ws.slug}` : "/enter");
  } catch (err) {
    console.error("[brokeros] could not look up the remembered workspace:", err);
    return go("/setup?reason=unreachable");
  }
}
