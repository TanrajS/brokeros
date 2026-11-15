"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, ExternalLink, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DOCUMENT_TYPE_SINGULAR, type DocumentType } from "@/lib/domain/documents";
import { formatDate } from "@/lib/format";
import { deleteDocument, renameDocument } from "@/server/documents/actions";
import { UploadDocumentDialog, type PolicyChoice } from "./UploadDocumentDialog";

export interface DocumentRowView {
  id: string;
  title: string;
  policyYear: string | null;
  status: "draft" | "final" | null;
  markets: string[];
  policyLabel: string | null;
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
  isSeed: boolean;
  reissueNeeded: boolean;
  reissueReason: string | null;
  notes: string | null;
}

interface Props {
  slug: string;
  accountId: string;
  folder: DocumentType;
  rows: DocumentRowView[];
  policyYears: string[];
  insurers: string[];
  policies: PolicyChoice[];
  /** Hide the upload button (policy page lists only). */
  canUpload?: boolean;
  emptyText?: string;
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** One folder's list: rename inline, open or download through the private route, delete with confirm. */
export function DocumentsFolder({ slug, accountId, folder, rows, policyYears, insurers, policies, canUpload = true, emptyText }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<DocumentRowView | null>(null);
  const href = (id: string, download = false) => `/w/${slug}/documents/${id}${download ? "?download=1" : ""}`;

  function saveRename() {
    if (!renaming) return;
    const target = renaming;
    startTransition(async () => {
      const res = await renameDocument(slug, target.id, { title: target.title });
      if (!res.ok) {
        toast.error(res.message, { description: res.fieldErrors?.title });
        return;
      }
      toast.success("Renamed");
      setRenaming(null);
      router.refresh();
    });
  }
  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    startTransition(async () => {
      const res = await deleteDocument(slug, target.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`${target.title} deleted`);
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="text-sm text-muted-foreground">{emptyText ?? `No ${DOCUMENT_TYPE_SINGULAR[folder].toLowerCase()}s filed yet.`}</p>
          {canUpload ? <UploadDocumentDialog slug={slug} accountId={accountId} folder={folder} policyYears={policyYears} insurers={insurers} policies={policies} /> : null}
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-lg border">
          <Table>
            <caption className="sr-only">{DOCUMENT_TYPE_SINGULAR[folder]} documents, newest upload first</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Policy year</TableHead>
                {folder === "proposal" ? <TableHead>Status</TableHead> : null}
                {folder === "submission" ? <TableHead>Markets</TableHead> : null}
                {folder === "certificate" || folder === "policy_document" ? <TableHead>Policy</TableHead> : null}
                <TableHead>File</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-32">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="min-w-56 whitespace-normal font-medium">
                    {renaming?.id === d.id ? (
                      <span className="flex items-center gap-1">
                        <Input aria-label="New title" value={renaming.title} onChange={(e) => setRenaming({ id: d.id, title: e.target.value })} className="h-8" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), saveRename())} />
                        <Button type="button" size="icon-sm" variant="ghost" aria-label="Save title" disabled={pending || !renaming.title.trim()} onClick={saveRename}>
                          <Check aria-hidden="true" />
                        </Button>
                        <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel rename" onClick={() => setRenaming(null)}>
                          <X aria-hidden="true" />
                        </Button>
                      </span>
                    ) : (
                      <>
                        <a href={href(d.id)} target="_blank" rel="noreferrer" className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                          {d.title}
                        </a>
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          {d.isSeed ? <Badge variant="outline">Demo file</Badge> : null}
                          {d.reissueNeeded ? (
                            <Badge variant="destructive" title={d.reissueReason ?? undefined}>
                              Reissue needed
                            </Badge>
                          ) : null}
                        </span>
                        {d.notes ? <span className="block text-xs text-muted-foreground">{d.notes}</span> : null}
                      </>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{d.policyYear ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  {folder === "proposal" ? <TableCell>{d.status ? <Badge variant={d.status === "final" ? "default" : "secondary"}>{d.status === "final" ? "Final" : "Draft"}</Badge> : "—"}</TableCell> : null}
                  {folder === "submission" ? <TableCell className="min-w-48 whitespace-normal text-xs">{d.markets.join(", ") || "—"}</TableCell> : null}
                  {folder === "certificate" || folder === "policy_document" ? <TableCell className="min-w-40 whitespace-normal text-xs">{d.policyLabel ?? <span className="text-muted-foreground">Not linked</span>}</TableCell> : null}
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {d.fileName}
                    <span className="block">{kb(d.sizeBytes)}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(d.uploadedAt.slice(0, 10))}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button asChild size="icon-sm" variant="ghost">
                      <a href={href(d.id)} target="_blank" rel="noreferrer" aria-label={`Open ${d.title}`}>
                        <ExternalLink aria-hidden="true" />
                      </a>
                    </Button>
                    <Button asChild size="icon-sm" variant="ghost">
                      <a href={href(d.id, true)} aria-label={`Download ${d.title}`}>
                        <Download aria-hidden="true" />
                      </a>
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Rename ${d.title}`} onClick={() => setRenaming({ id: d.id, title: d.title })}>
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${d.title}`} onClick={() => setDeleting(d)}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.title}?</AlertDialogTitle>
            <AlertDialogDescription>{deleting?.isSeed ? "This is a shared demo file: the entry leaves this workspace, the file stays for other demo workspaces." : "The file is removed from storage as well. This cannot be undone."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={confirmDelete}>
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
