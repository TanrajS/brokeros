import { NextResponse } from "next/server";
import { connection } from "next/server";
import { LINE_GROUPS, PLACEMENT_COLUMNS, PLACEMENT_CSV_NOTE, placementScheduleRows, type LineGroup } from "@/lib/domain/program";
import { toCsv } from "@/lib/format/csv";
import { layersFor, loadProgramLayers } from "@/server/program/queries";
import { getWorkspaceBySlug } from "@/server/workspace/queries";

/** The placement schedule as CSV (one row per insurer line), in the import's column order: a slip-style summary. Premiums are at 100%; the first line says so and the import skips it. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; accountId: string }> }) {
  await connection();
  const { slug, accountId } = await params;
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    const raw = new URL(request.url).searchParams.get("group") ?? "gl";
    const group: LineGroup = (LINE_GROUPS as readonly string[]).includes(raw) ? (raw as LineGroup) : "gl";
    const program = await loadProgramLayers(ws.id, accountId);
    const rows = placementScheduleRows(layersFor(program, group));
    return new NextResponse(`${PLACEMENT_CSV_NOTE}\r\n${toCsv([...PLACEMENT_COLUMNS], rows)}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="placement-${group}-${accountId.slice(0, 8)}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("[brokeros] placement export failed:", err);
    return NextResponse.json({ error: "Export failed. Check the database connection." }, { status: 500 });
  }
}
