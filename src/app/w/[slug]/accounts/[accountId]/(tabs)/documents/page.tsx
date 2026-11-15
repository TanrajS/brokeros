import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { DocumentsFolder, type DocumentRowView } from "@/components/documents/DocumentsFolder";
import { UploadDocumentDialog } from "@/components/documents/UploadDocumentDialog";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/domain/documents";
import { formatDate } from "@/lib/format";
import { getAccountDetail } from "@/server/accounts/queries";
import { blobReady } from "@/server/documents/blob";
import { accountPolicyYears, listAccountDocuments, workspaceInsurers } from "@/server/documents/queries";
import { requireWorkspace } from "../../../../lib";

export const metadata: Metadata = { title: "Documents" };

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();

function href(slug: string, accountId: string, folder: DocumentType, year: string, status: string): string {
  const params = new URLSearchParams();
  if (folder !== "proposal") params.set("folder", folder);
  if (year) params.set("year", year);
  if (status) params.set("status", status);
  const qs = params.toString();
  return `/w/${slug}/accounts/${accountId}/documents${qs ? `?${qs}` : ""}`;
}

/** The account's filing cabinet: four folders, filters by policy year and status, newest upload first. */
export default async function DocumentsPage({ params, searchParams }: { params: Promise<{ slug: string; accountId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ slug, accountId }, sp] = await Promise.all([params, searchParams]);
  const ws = await requireWorkspace(slug);
  const detail = await getAccountDetail(ws.id, accountId);
  if (!detail) notFound();
  const folder: DocumentType = (DOCUMENT_TYPES as readonly string[]).includes(first(sp.folder)) ? (first(sp.folder) as DocumentType) : "proposal";
  const year = first(sp.year);
  const status = first(sp.status) === "draft" || first(sp.status) === "final" ? first(sp.status) : "";
  const [all, insurers] = await Promise.all([listAccountDocuments(ws, accountId, detail.policies), workspaceInsurers(ws.id)]);
  const counts = Object.fromEntries(DOCUMENT_TYPES.map((t) => [t, all.filter((d) => d.docType === t).length])) as Record<DocumentType, number>;
  const inFolder = all.filter((d) => d.docType === folder);
  const years = [...new Set([...accountPolicyYears(detail.policies), ...all.map((d) => d.policyYear).filter((y): y is string => !!y)])];
  const rows: DocumentRowView[] = inFolder
    .filter((d) => (!year || d.policyYear === year) && (!status || d.status === status))
    .map((d) => ({ id: d.id, title: d.title, policyYear: d.policyYear, status: d.status, markets: d.markets, policyLabel: d.policyLabel, fileName: d.fileName, sizeBytes: d.sizeBytes, uploadedAt: d.uploadedAt.toISOString(), isSeed: d.isSeed, reissueNeeded: d.reissueNeeded, reissueReason: d.reissueReason, notes: d.notes }));
  const policies = detail.policies.map((p) => ({ id: p.id, label: `${p.lineOfBusiness} · ${p.carrier} · expires ${formatDate(p.expiryDate)}` }));
  const pill = (active: boolean) => cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted");
  const ready = blobReady();

  return (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-2 rounded-lg border border-amber-500/60 bg-amber-50 p-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>This is a demo. Upload only fictional documents: files are stored privately, are not virus-scanned, and sit on a free storage tier.</span>
      </p>
      {!ready ? (
        <p role="alert" className="rounded-lg border p-3 text-sm text-muted-foreground">
          Documents are not configured on this deployment (BLOB_READ_WRITE_TOKEN is missing), so uploads and downloads are off.
        </p>
      ) : null}
      <nav aria-label="Document folders" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex gap-1.5">
          {DOCUMENT_TYPES.map((t) => (
            <li key={t} className="shrink-0">
              <Link href={href(slug, accountId, t, "", "")} aria-current={t === folder ? "page" : undefined} className={pill(t === folder)}>
                {DOCUMENT_TYPE_LABELS[t]}
                <span className={cn("rounded-full px-1.5 text-xs tabular-nums", t === folder ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground")}>{counts[t]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="folder-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="folder-heading" className="text-lg font-semibold">
            {DOCUMENT_TYPE_LABELS[folder]}
            <span className="ml-2 text-sm font-normal text-muted-foreground">{rows.length === inFolder.length ? `${inFolder.length} on file` : `${rows.length} of ${inFolder.length} shown`}</span>
          </h2>
          {ready ? <UploadDocumentDialog slug={slug} accountId={accountId} folder={folder} policyYears={years} insurers={insurers} policies={policies} /> : null}
        </div>
        <form action={`/w/${slug}/accounts/${accountId}/documents`} method="get" className="flex flex-wrap items-end gap-2 text-sm">
          {folder !== "proposal" ? <input type="hidden" name="folder" value={folder} /> : null}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Policy year</span>
            <select name="year" defaultValue={year} className="native-control w-40">
              <option value="">All years</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          {folder === "proposal" ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Status</span>
              <select name="status" defaultValue={status} className="native-control w-32">
                <option value="">Draft and final</option>
                <option value="draft">Draft</option>
                <option value="final">Final</option>
              </select>
            </label>
          ) : null}
          <Button type="submit" variant="outline" size="sm">
            <Filter aria-hidden="true" />
            Filter
          </Button>
          {year || status ? (
            <Link href={href(slug, accountId, folder, "", "")} className="text-sm underline-offset-4 hover:underline">
              Clear
            </Link>
          ) : null}
        </form>
        <p className="text-xs text-muted-foreground">
          {folder === "proposal" ? "Proposals carry a status (Draft or Final) and a policy year." : folder === "submission" ? "Submissions record the markets they went to; the list is seeded from insurers already in the workspace." : folder === "certificate" ? "Certificates generated on a policy page are filed here automatically; manual uploads are allowed too. A certificate is flagged Reissue needed once its policy renews or expires." : "Wordings, binders, endorsements, statements of values and applications, optionally linked to a policy."}{" "}
          Sorted by upload date, newest first.
        </p>
        <DocumentsFolder slug={slug} accountId={accountId} folder={folder} rows={rows} policyYears={years} insurers={insurers} policies={policies} canUpload={ready} emptyText={inFolder.length === 0 ? `Nothing filed under ${DOCUMENT_TYPE_LABELS[folder].toLowerCase()} yet. Upload the first one.` : "No documents match the filters."} />
      </section>
    </div>
  );
}
