"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeCheckbox } from "@/components/form/Checkbox";
import { ValueOrMissing } from "@/components/Missing";
import { LINES_OF_BUSINESS, type LineOfBusiness } from "@/lib/constants";
import { CERTIFICATE_STATUS_LABELS, type CertificateStatus } from "@/lib/domain/program";
import { formatDate } from "@/lib/format";
import { certificateFormSchema, type CertificateFormInput, type CertificateFormValues } from "@/lib/schemas/program";
import { deleteCertificate, issueCertificate, saveCertificate } from "@/server/program/actions";

export interface CertificateRow {
  id: string;
  holder: string;
  operationsDescription: string | null;
  coverages: LineOfBusiness[];
  requiredBy: string | null;
  issuedOn: string | null;
  notes: string | null;
  status: CertificateStatus;
  reasons: string[];
}

interface Props {
  slug: string;
  accountId: string;
  asOf: string;
  rows: CertificateRow[];
  /** Compact: no add/edit controls, used on the Account page. */
  compact?: boolean;
}

type Editing = { mode: "create" } | { mode: "edit"; c: CertificateRow } | null;

export function statusVariant(s: CertificateStatus): "default" | "secondary" | "outline" | "destructive" {
  return s === "issued" ? "default" : s === "requested" ? "secondary" : s === "expired" ? "outline" : "destructive";
}

export function CertificatesSection({ slug, accountId, asOf, rows, compact = false }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<CertificateRow | null>(null);

  function issue(c: CertificateRow) {
    startTransition(async () => {
      const res = await issueCertificate(slug, c.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`Certificate for ${c.holder} ${c.issuedOn ? "reissued" : "issued"} as of ${formatDate(asOf)}`);
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    startTransition(async () => {
      const res = await deleteCertificate(slug, target.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Certificate removed");
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="certificates-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="certificates-heading" className="text-lg font-semibold">
          Certificates of insurance
        </h2>
        {!compact ? (
          <Button type="button" size="sm" onClick={() => setEditing({ mode: "create" })}>
            <Plus aria-hidden="true" />
            Add certificate
          </Button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">No certificates on this account.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Holder</TableHead>
                <TableHead>Coverages</TableHead>
                <TableHead>Required by</TableHead>
                <TableHead>Issued on</TableHead>
                <TableHead>Status</TableHead>
                {!compact ? (
                  <TableHead className="w-36">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="min-w-48 whitespace-normal">
                    <span className="font-medium">{c.holder}</span>
                    {c.operationsDescription ? <span className="block text-xs text-muted-foreground">{c.operationsDescription}</span> : null}
                  </TableCell>
                  <TableCell className="min-w-40 whitespace-normal text-xs">{c.coverages.join(", ")}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <ValueOrMissing text={formatDate(c.requiredBy)} what="Required-by date" />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{c.issuedOn ? formatDate(c.issuedOn) : <span className="text-muted-foreground">Not issued</span>}</TableCell>
                  <TableCell className="min-w-44 whitespace-normal">
                    <Badge variant={statusVariant(c.status)}>{CERTIFICATE_STATUS_LABELS[c.status]}</Badge>
                    <span className="mt-1 block text-xs text-muted-foreground">{c.reasons.join("; ")}</span>
                  </TableCell>
                  {!compact ? (
                    <TableCell className="text-right whitespace-nowrap">
                      {c.status === "requested" || c.status === "reissue_needed" || c.status === "expired" ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => issue(c)} disabled={pending} className="mr-1">
                          <FileCheck aria-hidden="true" />
                          {c.issuedOn ? "Reissue" : "Issue"}
                        </Button>
                      ) : null}
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit certificate for ${c.holder}`} onClick={() => setEditing({ mode: "edit", c })}>
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete certificate for ${c.holder}`} onClick={() => setDeleting(c)}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {!compact ? (
        <p className="text-xs text-muted-foreground">
          Status is worked out from the policies: Requested until issued; Issued while every underlying policy is in force; Reissue needed once one expires or is renewed; Expired when
          the required-by date passes with no issuance. Issue and Reissue stamp the as-of date ({formatDate(asOf)}).
        </p>
      ) : null}

      {editing ? (
        <CertificateDialog key={editing.mode === "edit" ? editing.c.id : "new"} slug={slug} accountId={accountId} asOf={asOf} editing={editing} onClose={() => setEditing(null)} />
      ) : null}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the certificate for {deleting?.holder}?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={pending}>
              {pending ? "Removing…" : "Remove certificate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function CertificateDialog({ slug, accountId, asOf, editing, onClose }: { slug: string; accountId: string; asOf: string; editing: NonNullable<Editing>; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const c = editing.mode === "edit" ? editing.c : null;
  const defaults: CertificateFormInput = c
    ? { holder: c.holder, operationsDescription: c.operationsDescription ?? "", coverages: c.coverages, requiredBy: c.requiredBy ?? "", issuedOn: c.issuedOn ?? "", notes: c.notes ?? "" }
    : { holder: "", operationsDescription: "", coverages: ["General Liability"], requiredBy: "", issuedOn: "", notes: "" };
  const { register, handleSubmit, formState, getValues, setError } = useForm<CertificateFormInput, unknown, CertificateFormValues>({
    resolver: zodResolver(certificateFormSchema(asOf)),
    defaultValues: defaults,
    mode: "onChange",
  });
  const msg = (k: keyof CertificateFormInput) => formState.errors[k]?.message;

  function onSubmit() {
    const raw = getValues();
    startTransition(async () => {
      const res = await saveCertificate(slug, accountId, c?.id ?? null, raw);
      if (!res.ok) {
        toast.error(res.message);
        for (const [field, message] of Object.entries(res.fieldErrors ?? {})) setError(field as keyof CertificateFormInput, { message });
        return;
      }
      toast.success(c ? "Certificate saved" : "Certificate added");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{c ? "Edit certificate" : "Add certificate"}</DialogTitle>
            <DialogDescription>Leave the issue date blank for a request; set it when the certificate goes out.</DialogDescription>
          </DialogHeader>
          <Field id="cert-holder" label="Certificate holder" required error={msg("holder")}>
            <Input {...register("holder")} {...fieldA11y("cert-holder", msg("holder"))} autoComplete="off" />
          </Field>
          <Field id="cert-ops" label="Description of operations" error={msg("operationsDescription")}>
            <Textarea {...register("operationsDescription")} {...fieldA11y("cert-ops", msg("operationsDescription"))} rows={2} />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Coverages requested</legend>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {LINES_OF_BUSINESS.map((l) => (
                <NativeCheckbox key={l} id={`cert-cov-${l}`} value={l} label={l} {...register("coverages")} />
              ))}
            </div>
            {msg("coverages") ? (
              <p className="text-xs text-destructive" role="alert">
                {msg("coverages")}
              </p>
            ) : null}
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="cert-required" label="Required by" error={msg("requiredBy")}>
              <Input type="date" {...register("requiredBy")} {...fieldA11y("cert-required", msg("requiredBy"))} />
            </Field>
            <Field id="cert-issued" label="Issued on" error={msg("issuedOn")} hint={`Not after ${formatDate(asOf)}`}>
              <Input type="date" {...register("issuedOn")} {...fieldA11y("cert-issued", msg("issuedOn"), "hint")} max={asOf} />
            </Field>
          </div>
          <Field id="cert-notes" label="Notes" error={msg("notes")}>
            <Textarea {...register("notes")} {...fieldA11y("cert-notes", msg("notes"))} rows={2} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formState.isValid || pending}>
              {pending ? "Saving…" : "Save certificate"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
