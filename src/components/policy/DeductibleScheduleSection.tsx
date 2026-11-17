"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/InfoTip";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeSelect } from "@/components/form/NativeSelect";
import { Missing } from "@/components/Missing";
import { DEDUCTIBLE_KINDS, DEDUCTIBLE_KIND_LABELS, checkPartLimits, describeRule, type DeductibleKind, type HeadlineLimits } from "@/lib/domain/deductibles";
import { parseCurrencyInput } from "@/lib/domain/money";
import { formatCurrency } from "@/lib/format";
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
  occurrenceLimit: number | null;
  aggregateLimit: number | null;
  notes: string | null;
  isDefault: boolean;
}

interface Props {
  slug: string;
  policyId: string;
  /** The policy's deductible field; the default row mirrors it. */
  policyDeductible: number | null;
  /** The policy's headline limits; a part above them is warned, not blocked. */
  headline: HeadlineLimits;
  rows: DeductibleRow[];
}

type Dialogs = { kind: "edit"; row: DeductibleRow | null } | { kind: "delete"; row: DeductibleRow } | null;
const str = (n: number | null) => (n === null ? "" : String(n));

/** The policy's coverage schedule: the default (all other perils) part with the headline terms, plus named perils and coverage parts with their own deductible and sublimits. */
export function DeductibleScheduleSection({ slug, policyId, policyDeductible, headline, rows }: Props) {
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
      toast.success(`${row.appliesTo} removed from the coverage schedule`);
      setDialog(null);
      router.refresh();
    });
  }

  const deductibleText = (r: DeductibleRow) => (r.isDefault && r.amount === null ? null : describeRule(r).replace(`${r.appliesTo}: `, ""));

  return (
    <section aria-labelledby="deductibles-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="deductibles-heading" className="flex items-center gap-1.5 text-lg font-semibold">
          Coverage schedule
          {rows.length ? <span className="ml-1 text-sm font-normal text-muted-foreground">{rows.length} {rows.length === 1 ? "coverage part" : "coverage parts"}</span> : null}
          <InfoTip label="About the coverage schedule">
            The all-other-perils row is the policy&apos;s own deductible and headline limits and stays in step with them. Every other row is a coverage part with its own deductible rule and, where the
            policy gives it one, its own occurrence and aggregate limits (sublimits). Claims tagged with a part use that part&apos;s deductible in the retention analysis, and the part of a loss above the
            part&apos;s occurrence limit is retained by the client.
          </InfoTip>
        </h2>
        <div className="flex flex-wrap gap-2">
          <ImportScheduleDialog slug={slug} policyId={policyId} existingAppliesTo={rows.map((r) => r.appliesTo)} headline={headline} />
          <Button type="button" size="sm" onClick={() => setDialog({ kind: "edit", row: null })}>
            <Plus aria-hidden="true" />
            Add coverage part
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          {policyDeductible === null && headline.occurrenceLimit === null && headline.aggregateLimit === null ? "No deductible or limits on this policy. Enter them on the policy to create the default row, then add coverage parts." : "No coverage parts yet."}
        </p>
      ) : (
        <div className="relative overflow-x-auto rounded-lg border">
          <Table>
            <caption className="sr-only">Coverage schedule</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Applies to</TableHead>
                <TableHead>Deductible</TableHead>
                <TableHead className="text-right">Occurrence limit ($)</TableHead>
                <TableHead className="text-right">Aggregate limit ($)</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const check = r.isDefault ? null : checkPartLimits(r, headline).value;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {r.appliesTo}
                      {r.isDefault ? (
                        <Badge variant="outline" className="ml-2">
                          Default
                        </Badge>
                      ) : null}
                      {check && check.warnings.length ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" tabIndex={0} className="ml-2 cursor-help gap-1 border-amber-500/60 font-normal" aria-label={check.warnings.join("; ")}>
                              <AlertTriangle className="size-3" aria-hidden="true" />
                              Above the headline limit
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs whitespace-normal">{check.warnings.join(" ")}</TooltipContent>
                        </Tooltip>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {deductibleText(r) ?? <Missing what="Deductible" />}
                      <span className="block text-xs text-muted-foreground">{DEDUCTIBLE_KIND_LABELS[r.kind]}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.occurrenceLimit === null ? <span className="text-muted-foreground">{r.isDefault ? "—" : "policy limit"}</span> : formatCurrency(r.occurrenceLimit)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.aggregateLimit === null ? <span className="text-muted-foreground">{r.isDefault ? "—" : "policy limit"}</span> : formatCurrency(r.aggregateLimit)}</TableCell>
                    <TableCell className="min-w-40 whitespace-normal text-xs text-muted-foreground">{r.notes ?? ""}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${r.appliesTo}`} onClick={() => setDialog({ kind: "edit", row: r })}>
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${r.appliesTo}`} disabled={r.isDefault} title={r.isDefault ? "Clear the policy's deductible and limits instead" : undefined} onClick={() => setDialog({ kind: "delete", row: r })}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog?.kind === "edit" ? <DeductibleDialog slug={slug} policyId={policyId} row={dialog.row} headline={headline} onClose={() => setDialog(null)} /> : null}
      <AlertDialog open={dialog?.kind === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog?.kind === "delete" ? `Delete the ${dialog.row.appliesTo} coverage part?` : ""}</AlertDialogTitle>
            <AlertDialogDescription>Claims for this part fall back to the all-other-perils deductible and the policy&apos;s headline limits in the retention analysis. This cannot be undone.</AlertDialogDescription>
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

function DeductibleDialog({ slug, policyId, row, headline, onClose }: { slug: string; policyId: string; row: DeductibleRow | null; headline: HeadlineLimits; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, formState, getValues, setError, control, trigger } = useForm<DeductibleFormInput, unknown, DeductibleFormValues>({
    resolver: zodResolver(deductibleFormSchema),
    defaultValues: row
      ? { appliesTo: row.appliesTo, kind: row.kind, amount: str(row.amount), percent: str(row.percent), minimum: str(row.minimum), maximum: str(row.maximum), hours: str(row.hours), occurrenceLimit: str(row.occurrenceLimit), aggregateLimit: str(row.aggregateLimit), notes: row.notes ?? "" }
      : { appliesTo: "", kind: "flat", amount: "", percent: "", minimum: "", maximum: "", hours: "", occurrenceLimit: "", aggregateLimit: "", notes: "" },
    mode: "onChange",
  });
  const msg = (k: keyof DeductibleFormInput) => formState.errors[k]?.message;
  const kind = useWatch({ control, name: "kind" });
  const isPercent = kind === "percent_of_loss" || kind === "percent_of_value";
  // Live warning (never a block) when a part limit sits above the policy's headline limit.
  const [appliesTo, occRaw, aggRaw] = useWatch({ control, name: ["appliesTo", "occurrenceLimit", "aggregateLimit"] });
  const warnings = useMemo(() => {
    if (row?.isDefault) return [];
    return checkPartLimits({ appliesTo: appliesTo || "This part", occurrenceLimit: parseCurrencyInput(occRaw ?? "").value, aggregateLimit: parseCurrencyInput(aggRaw ?? "").value }, headline).value.warnings;
  }, [appliesTo, occRaw, aggRaw, headline, row?.isDefault]);

  function onSubmit() {
    startTransition(async () => {
      const res = await saveDeductible(slug, policyId, row?.id ?? null, getValues());
      if (!res.ok) {
        toast.error(res.message);
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k as keyof DeductibleFormInput, { message: m });
        return;
      }
      toast.success(row ? "Coverage part saved" : "Coverage part added", res.data.warnings.length ? { description: res.data.warnings.join(" ") } : undefined);
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{row ? `Edit ${row.appliesTo}` : "Add coverage part"}</DialogTitle>
            <DialogDescription>
              {row?.isDefault
                ? "The default part is the policy's own deductible (a flat amount) and headline limits; changing them here also changes the policy."
                : "A deductible (flat, percent of loss or of value at risk, or a waiting period) and, where the policy gives this part its own limits, an occurrence and aggregate limit. Leave a limit blank when the policy's headline limit applies."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="ded-applies" label="Applies to" required error={msg("appliesTo")} hint="Peril or coverage part, e.g. Earthquake, Flood, Stock">
              <Input {...register("appliesTo")} {...fieldA11y("ded-applies", msg("appliesTo"), "hint")} autoComplete="off" readOnly={row?.isDefault} />
            </Field>
            <Field id="ded-kind" label="Deductible kind" required error={msg("kind")}>
              <NativeSelect {...register("kind", { onChange: () => void trigger(["amount", "percent", "hours"]) })} {...fieldA11y("ded-kind", msg("kind"))} disabled={row?.isDefault}>
                {DEDUCTIBLE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {DEDUCTIBLE_KIND_LABELS[k]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {kind === "flat" ? (
              <Field id="ded-amount" label="Deductible (CAD)" required={!row?.isDefault} error={msg("amount")} hint={row?.isDefault ? "Blank clears the policy's deductible" : undefined}>
                <Input {...register("amount")} {...fieldA11y("ded-amount", msg("amount"), row?.isDefault ? "hint" : undefined)} inputMode="decimal" />
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
            <Field id="ded-occ" label="Occurrence limit (CAD)" error={msg("occurrenceLimit")} hint={row?.isDefault ? "The policy's headline limit" : headline.occurrenceLimit !== null ? `Policy: ${formatCurrency(headline.occurrenceLimit)}` : undefined}>
              <Input {...register("occurrenceLimit", { onChange: () => void trigger("aggregateLimit") })} {...fieldA11y("ded-occ", msg("occurrenceLimit"), row?.isDefault || headline.occurrenceLimit !== null ? "hint" : undefined)} inputMode="decimal" />
            </Field>
            <Field id="ded-agg" label="Aggregate limit (CAD)" error={msg("aggregateLimit")} hint={row?.isDefault ? "The policy's headline aggregate" : headline.aggregateLimit !== null ? `Policy: ${formatCurrency(headline.aggregateLimit)}` : undefined}>
              <Input {...register("aggregateLimit")} {...fieldA11y("ded-agg", msg("aggregateLimit"), row?.isDefault || headline.aggregateLimit !== null ? "hint" : undefined)} inputMode="decimal" />
            </Field>
            <Field id="ded-notes" label="Notes" error={msg("notes")} className="flex flex-col gap-1.5 sm:col-span-2">
              <Input {...register("notes")} {...fieldA11y("ded-notes", msg("notes"))} />
            </Field>
          </div>
          {warnings.length ? (
            <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-500/60 bg-amber-50 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{warnings.join(" ")} Some insurers do write higher sublimits, so this is allowed.</span>
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formState.isValid || pending}>
              {pending ? "Saving…" : "Save coverage part"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
