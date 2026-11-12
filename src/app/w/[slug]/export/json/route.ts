import { NextResponse } from "next/server";
import { getWorkspaceBySlug } from "@/server/workspace/queries";
import { exportWorkspaceJson } from "@/server/exports/queries";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    const payload = await exportWorkspaceJson(ws);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="brokeros-${slug}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("[brokeros] JSON export failed:", err);
    return NextResponse.json({ error: "Export failed. Check the database connection." }, { status: 500 });
  }
}
