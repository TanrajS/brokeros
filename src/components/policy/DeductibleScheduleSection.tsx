"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeSelect } from "@/components/form/NativeSelect";
import { DEDUCTIBLE_KINDS, DEDUCTIBLE_KIND_LABELS, describeRule, type DeductibleKind } from "@/lib/domain/deductibles";
import { deductibleFormSchema, type DeductibleFormInput, type DeductibleFormValues } from "@/lib/schemas/deductible";
import { deleteDeductible, saveDeductible } from "@/server/deductibles/actions";
import { ImportScheduleDialog } from "./ImportScheduleDialog";

export interface DeductibleRow {
  id: string;
  appliesTo: string;
  kind: DeductibleKind;
  amount: number | null;
  percent: number | null;
  minimum: number | null;
  maximum: number | null;
  hours: number | null;
  notes: string | null;
  isDefault: boolean;
}

interface Props {
  slug: string;
  policyId: string;
  /** The policy's deductible field; the default row mirrors it. */
  policyDeductible: number | null;
  rows: DeductibleRow[];
}

type Dialogs = { kind: "edit"; row: DeductibleRow | null } | { kind: "delete"; row: DeductibleRow } | null;
const str = (n: number | null) => (n === null ? "" : String(n));

/** The policy's deductible schedule: the default (all other perils) row plus named perils and coverage parts. */
export function DeductibleScheduleSection({ slug, policyId, policyDeductible, rows }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<Dialogs>(null);

  function remove(row: DeductibleRow) {
    startTransition(async () => {
      const res = await deleteDeductible(slug, row.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`${row.appliesTo} deductible removed`);
      setDialog(null);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="deductibles-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="deductibles-heading" className="text-lg font-semibold">
          Deductible schedule
          {rows.length ? <span className="ml-2 text-sm font-normal text-muted-foreground">{rows.length} {rows.length === 1 ? "deductible" : "deductibles"}</span> : null}
        </h2>
        <div className="flex flex-wrap gap-2">
          <ImportScheduleDialog slug={slug} policyId={policyId} existingAppliesTo={rows.map((r) => r.appliesTo)} />
          <Button type="button" size="sm" onClick={() => setDialog({ kind: "edit", row: null })}>
            <Plus aria-hidden="true" />
            Add deductible
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        The all-other-perils row is the policy&apos;s deductible field and stays in step with it. Claims tagged with a peril use that peril&apos;s rule in the retention replay; every other claim uses the
        default.
      </p>
      {rows.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          {policyDeductible === null ? "No deductible on this policy. Enter one on the policy to create the default row, then add named perils." : "No schedule rows yet."}
        </p>
      ) : (
        <div className="relative overflow-x-auto rounded-lg border">
          <Table>
            <caption className="sr-only">Deductible schedule</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Applies to</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Terms</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {r.appliesTo}
                    {r.isDefault ? " " : null}
                    {r.isDefault ? (
                      <Badge variant="outline" className="ml-2">
                        Default
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>{DEDUCTIBLE_KIND_LABELS[r.kind]}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{describeRule(r).replace(`${r.appliesTo}: `, "")}</TableCell>
                  <TableCell className="min-w-40 whitespace-normal text-xs text-muted-foreground">{r.notes ?? ""}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${r.appliesTo} deductible`} onClick={() => setDialog({ kind: "edit", row: r })}>
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${r.appliesTo} deductible`} disabled={r.isDefault} title={r.isDefault ? "Clear the policy's deductible instead" : undefined} onClick={() => setDialog({ kind: "delete", row: r })}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog?.kind === "edit" ? <DeductibleDialog slug={slug} policyId={policyId} row={dialog.row} onClose={() => setDialog(null)} /> : null}
      <AlertDialog open={dialog?.kind === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog?.kind === "delete" ? `Delete the ${dialog.row.appliesTo} deductible?` : ""}</AlertDialogTitle>
            <AlertDialogDescription>Claims for this peril fall back to the all-other-perils deductible in the replay. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={() => dialog?.kind === "delete" && remove(dialog.row)}>
              {pending ? "Removing…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function DeductibleDialog({ slug, policyId, row, onClose }: { slug: string; policyId: string; row: DeductibleRow | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, formState, getValues, setError, control, trigger } = useForm<DeductibleFormInput, unknown, DeductibleFormValues>({
    resolver: zodResolver(deductibleFormSchema),
    defaultValues: row
      ? { appliesTo: row.appliesTo, kind: row.kind, amount: str(row.amount), percent: str(row.percent), minimum: str(row.minimum), maximum: str(row.maximum), hours: str(row.hours), notes: row.notes ?? "" }
      : { appliesTo: "", kind: "flat", amount: "", percent: "", minimum: "", maximum: "", hours: "", notes: "" },
    mode: "onChange",
  });
  const msg = (k: keyof DeductibleFormInput) => formState.errors[k]?.message;
  const kind = useWatch({ control, name: "kind" });
  const isPercent = kind === "percent_of_loss" || kind === "percent_of_value";

  function onSubmit() {
    startTransition(async () => {
      const res = await saveDeductible(slug, policyId, row?.id ?? null, getValues());
      if (!res.ok) {
        toast.error(res.message);
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k as keyof DeductibleFormInput, { message: m });
        return;
      }
      toast.success(row ? "Deductible saved" : "Deductible added");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{row ? `Edit ${row.appliesTo} deductible` : "Add deductible"}</DialogTitle>
            <DialogDescription>
              {row?.isDefault ? "The default deductible is a flat amount; changing it also changes the policy's deductible field." : "A flat amount, a percent of the loss or of the value at risk (with a minimum and maximum), or a waiting period in hours."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="ded-applies" label="Applies to" required error={msg("appliesTo")} hint="Peril or coverage part, e.g. Earthquake, Flood, Stock">
              <Input {...register("appliesTo")} {...fieldA11y("ded-applies", msg("appliesTo"), "hint")} autoComplete="off" readOnly={row?.isDefault} />
            </Field>
            <Field id="ded-kind" label="Kind" required error={msg("kind")}>
              <NativeSelect {...register("kind", { onChange: () => void trigger(["amount", "percent", "hours"]) })} {...fieldA11y("ded-kind", msg("kind"))} disabled={row?.isDefault}>
                {DEDUCTIBLE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {DEDUCTIBLE_KIND_LABELS[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {kind === "flat" ? (
              <Field id="ded-amount" label="Amount (CAD)" required error={msg("amount")}>
                <Input {...register("amount")} {...fieldA11y("ded-amount", msg("amount"))} inputMode="decimal" />
              </Field>
            ) : null}
            {isPercent ? (
              <>
                <Field id="ded-percent" label={kind === "percent_of_loss" ? "Percent of loss (%)" : "Percent of value at risk (%)"} required error={msg("percent")}>
                  <Input {...register("percent")} {...fieldA11y("ded-percent", msg("percent"))} inputMode="decimal" />
                </Field>
                <Field id="ded-min" label="Minimum (CAD)" error={msg("minimum")}>
                  <Input {...register("minimum", { onChange: () => void trigger("maximum") })} {...fieldA11y("ded-min", msg("minimum"))} inputMode="decimal" />
                </Field>
                <Field id="ded-max" label="Maximum (CAD)" error={msg("maximum")}>
                  <Input {...register("maximum")} {...fieldA11y("ded-max", msg("maximum"))} inputMode="decimal" />
                </Field>
              </>
            ) : null}
            {kind === "waiting_period" ? (
              <Field id="ded-hours" label="Waiting period (hours)" required error={msg("hours")}>
                <Input {...register("hours")} {...fieldA11y("ded-hours", msg("hours"))} inputMode="numeric" />
              </Field>
            ) : null}
            <Field id="ded-notes" label="Notes" error={msg("notes")} className="flex flex-col gap-1.5 sm:col-span-2">
              <Input {...register("notes")} {...fieldA11y("ded-notes", msg("notes"))} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formState.isValid || pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
