"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, fieldA11y } from "@/components/form/Field";
import { Missing } from "@/components/Missing";
import { formatCurrency } from "@/lib/format";
import { sublimitFormSchema, type SublimitFormInput, type SublimitFormValues } from "@/lib/schemas/program";
import { deleteSublimit, saveSublimit } from "@/server/program/actions";

export interface SublimitRow {
  id: string;
  name: string;
  limit: number | null;
  deductible: number | null;
  notes: string | null;
}

interface Props {
  slug: string;
  policyId: string;
  policyLimit: number | null;
  policyDeductible: number | null;
  rows: SublimitRow[];
}

type Editing = { mode: "create" } | { mode: "edit"; s: SublimitRow } | null;
const str = (n: number | null) => (n === null ? "" : String(n));

/** Sub-limits with their own deductibles. The policy's limit and deductible remain the defaults for everything not listed. */
export function SublimitsSection({ slug, policyId, policyLimit, policyDeductible, rows }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<SublimitRow | null>(null);

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    startTransition(async () => {
      const res = await deleteSublimit(slug, target.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`Removed ${target.name}`);
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="sublimits-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="sublimits-heading" className="text-lg font-semibold">
          Sub-limits and deductibles
        </h2>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ mode: "create" })}>
          <Plus aria-hidden="true" />
          Add sub-limit
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Policy default: limit {policyLimit === null ? "not entered" : formatCurrency(policyLimit)}, deductible {policyDeductible === null ? "not entered" : formatCurrency(policyDeductible)}.
      </p>
      {rows.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">No sub-limits recorded; the policy limit and deductible apply throughout.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coverage</TableHead>
                <TableHead className="text-right">Limit</TableHead>
                <TableHead className="text-right">Deductible</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.limit === null ? <Missing what="Limit (policy limit applies)" /> : formatCurrency(s.limit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.deductible === null ? <Missing what="Deductible (policy deductible applies)" /> : formatCurrency(s.deductible)}</TableCell>
                  <TableCell className="min-w-40 whitespace-normal text-xs text-muted-foreground">{s.notes ?? ""}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${s.name}`} onClick={() => setEditing({ mode: "edit", s })}>
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${s.name}`} onClick={() => setDeleting(s)}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing ? <SublimitDialog key={editing.mode === "edit" ? editing.s.id : "new"} slug={slug} policyId={policyId} editing={editing} onClose={() => setEditing(null)} /> : null}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the {deleting?.name} sub-limit?</AlertDialogTitle>
            <AlertDialogDescription>The policy limit and deductible will apply to it again. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={pending}>
              {pending ? "Removing…" : "Remove sub-limit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function SublimitDialog({ slug, policyId, editing, onClose }: { slug: string; policyId: string; editing: NonNullable<Editing>; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const s = editing.mode === "edit" ? editing.s : null;
  const defaults: SublimitFormInput = s ? { name: s.name, limit: str(s.limit), deductible: str(s.deductible), notes: s.notes ?? "" } : { name: "", limit: "", deductible: "", notes: "" };
  const { register, handleSubmit, formState, getValues, setError } = useForm<SublimitFormInput, unknown, SublimitFormValues>({
    resolver: zodResolver(sublimitFormSchema),
    defaultValues: defaults,
    mode: "onChange",
  });
  const msg = (k: keyof SublimitFormInput) => formState.errors[k]?.message;

  function onSubmit() {
    const raw = getValues();
    startTransition(async () => {
      const res = await saveSublimit(slug, policyId, s?.id ?? null, raw);
      if (!res.ok) {
        toast.error(res.message);
        for (const [field, message] of Object.entries(res.fieldErrors ?? {})) setError(field as keyof SublimitFormInput, { message });
        return;
      }
      toast.success(s ? "Sub-limit saved" : "Sub-limit added");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{s ? "Edit sub-limit" : "Add sub-limit"}</DialogTitle>
            <DialogDescription>Leave a field blank where the policy default applies.</DialogDescription>
          </DialogHeader>
          <Field id="sub-name" label="Coverage" required error={msg("name")} hint="e.g. Earthquake, Flood, Stock in process">
            <Input {...register("name")} {...fieldA11y("sub-name", msg("name"), "hint")} autoComplete="off" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="sub-limit" label="Limit (CAD)" error={msg("limit")}>
              <Input {...register("limit")} {...fieldA11y("sub-limit", msg("limit"))} inputMode="decimal" />
            </Field>
            <Field id="sub-ded" label="Deductible (CAD)" error={msg("deductible")}>
              <Input {...register("deductible")} {...fieldA11y("sub-ded", msg("deductible"))} inputMode="decimal" />
            </Field>
          </div>
          <Field id="sub-notes" label="Notes" error={msg("notes")}>
            <Input {...register("notes")} {...fieldA11y("sub-notes", msg("notes"))} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formState.isValid || pending}>
              {pending ? "Saving…" : "Save sub-limit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
