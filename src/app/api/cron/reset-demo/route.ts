import { NextResponse } from "next/server";
import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { workspaces } from "@/server/db/schema";
import { getCronSecret } from "@/server/env";
import { resetDemoWorkspace } from "@/server/workspace/reset";

/**
 * Nightly reset (vercel.json cron). Reloads the demo book into every workspace
 * flagged `reset_nightly`, reusing the shared seed blobs. Requires the bearer
 * token Vercel sends from CRON_SECRET; without the secret the route is off.
 */
export async function GET(request: Request) {
  await connection();
  const secret = getCronSecret();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const db = getDb();
    const targets = await db.select().from(workspaces).where(eq(workspaces.resetNightly, true));
    const results = [];
    for (const ws of targets) results.push({ slug: ws.slug, ...(await resetDemoWorkspace(db, ws)) });
    return NextResponse.json({ reset: results }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[brokeros] demo reset failed:", err);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}
