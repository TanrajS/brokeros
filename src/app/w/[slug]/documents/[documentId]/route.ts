import { NextResponse } from "next/server";
import { connection } from "next/server";
import { openBlob } from "@/server/documents/blob";
import { getDocument } from "@/server/documents/queries";
import { readWorkspaceCookie } from "@/server/workspace/cookie";
import { getWorkspaceBySlug } from "@/server/workspace/queries";

/**
 * Streams a private document. The workspace cookie must name the workspace the
 * document belongs to, so files are never listable or fetchable from outside.
 * `?download=1` sends it as an attachment; otherwise it opens inline.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; documentId: string }> }) {
  await connection();
  const { slug, documentId } = await params;
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    const cookieWorkspace = await readWorkspaceCookie();
    if (cookieWorkspace !== ws.id) return NextResponse.json({ error: "Open the workspace first" }, { status: 403 });
    if (!/^[0-9a-f-]{36}$/.test(documentId)) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    const doc = await getDocument(ws.id, documentId);
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    const file = await openBlob(doc.fileUrl);
    if (!file) return NextResponse.json({ error: "The file is no longer in storage" }, { status: 404 });
    const download = new URL(request.url).searchParams.get("download") === "1";
    const safe = doc.fileName.replace(/["\r\n]/g, "");
    return new NextResponse(file.stream, {
      headers: {
        "content-type": doc.mimeType || file.contentType,
        "content-length": String(file.size),
        "content-disposition": `${download ? "attachment" : "inline"}; filename="${safe}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[brokeros] document download failed:", err);
    return NextResponse.json({ error: "Download failed." }, { status: 500 });
  }
}
