import { NextResponse } from "next/server";
import { getWorkspaceBySlug } from "@/server/workspace/queries";
import { exportAccountsCsv, exportPoliciesCsv } from "@/server/exports/queries";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const type = new URL(request.url).searchParams.get("type");
  if (type !== "accounts" && type !== "policies") {
    return NextResponse.json({ error: "type must be accounts or policies" }, { status: 400 });
  }
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    const csv = type === "accounts" ? await exportAccountsCsv(ws) : await exportPoliciesCsv(ws);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="brokeros-${slug}-${type}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("[brokeros] CSV export failed:", err);
    return NextResponse.json({ error: "Export failed. Check the database connection." }, { status: 500 });
  }
}
