import { connection, NextResponse, type NextRequest } from "next/server";
import { isDatabaseConfigured } from "@/server/db/client";
import { writeWorkspaceCookie } from "@/server/workspace/cookie";
import { createWorkspace, todayISO } from "@/server/workspace/queries";

/**
 * GET /enter — creates a brand-new empty workspace, remembers it in the
 * httpOnly cookie and redirects to it. Reached only via the server-side
 * redirect from "/", so link prefetching can never create workspaces.
 */
export async function GET(request: NextRequest) {
  // Never run at build time: creating a workspace is a request-time side effect.
  await connection();
  if (!isDatabaseConfigured()) {
    return NextResponse.redirect(new URL("/setup?reason=missing", request.url), 303);
  }
  try {
    const ws = await createWorkspace({ name: "My brokerage", asOfDate: todayISO() });
    await writeWorkspaceCookie(ws.id);
    return NextResponse.redirect(new URL(`/w/${ws.slug}`, request.url), 303);
  } catch (err) {
    console.error("[brokeros] could not create a workspace:", err);
    return NextResponse.redirect(new URL("/setup?reason=unreachable", request.url), 303);
  }
}
