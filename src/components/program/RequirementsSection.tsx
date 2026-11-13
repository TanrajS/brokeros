"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { NativeSelect } from "@/components/form/NativeSelect";
import { NativeCheckbox } from "@/components/form/Checkbox";
import { ShowMath } from "@/components/dashboard/ShowMath";
import { ENDORSEMENTS, ENDORSEMENT_LABELS } from "@/lib/constants";
import { REQUIREMENT_COVERAGES, REQUIREMENT_STATUS_LABELS, type RequirementResult } from "@/lib/domain/program";
import { formatCurrency } from "@/lib/format";
import { requirementFormSchema, type RequirementFormInput, type RequirementFormValues } from "@/lib/schemas/program";
import { deleteRequirement, saveRequirement } from "@/server/program/actions";

interface Props {
  slug: string;
  accountId: string;
  results: RequirementResult[];
  countUmbrella: boolean;
  toggleHref: string;
  mathLines: string[];
  notesById: Record<string, string | null>;
}

type Editing = { mode: "create" } | { mode: "edit"; r: RequirementResult } | null;
const str = (n: number | null) => (n === null ? "" : String(n));

export function RequirementsSection({ slug, accountId, results, countUmbrella, toggleHref, mathLines, notesById }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<RequirementResult | null>(null);

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    startTransition(async () => {
      const res = await deleteRequirement(slug, target.requirement.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Requirement removed");
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="requirements-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="requirements-heading" className="text-lg font-semibold">
          Contract requirements
        </h2>
        <Button type="button" size="sm" onClick={() => setEditing({ mode: "create" })}>
          <Plus aria-hidden="true" />
          Add requirement
        </Button>
      </div>
      <div className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Count umbrella and excess limits toward the per-occurrence requirement:</span>
          <Badge variant={countUmbrella ? "default" : "outline"}>{countUmbrella ? "On" : "Off"}</Badge>
          <Button asChild size="sm" variant="outline">
            <Link href={toggleHref} scroll={false}>
              {countUmbrella ? "Compare on the strict basis" : "Count the umbrella"}
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Many contracts accept an umbrella sitting over the primary to reach the required per-occurrence limit; others want it in the primary policy itself. It is a
          contract-specific question, so this checker shows both bases. Umbrella limits never count toward an aggregate requirement here.
        </p>
      </div>

      {results.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">No contract requirements recorded. Add one to compare it with the policies and tower.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead className="text-right">Required (occ / agg)</TableHead>
                <TableHead className="text-right">Provided (occ / agg)</TableHead>
                <TableHead className="text-right">Gap</TableHead>
                <TableHead>Endorsements</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((r) => {
                const q = r.requirement;
                const statutory = q.requiredOccurrence === null && q.requiredAggregate === null;
                return (
                  <TableRow key={q.id}>
                    <TableCell className="min-w-48 whitespace-normal">
                      <span className="font-medium">{q.contractName}</span>
                      <span className="block text-xs text-muted-foreground">{q.counterparty}</span>
                      {notesById[q.id] ? <span className="block text-xs text-muted-foreground">{notesById[q.id]}</span> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{q.coverage}</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {statutory ? "Statutory" : `${q.requiredOccurrence === null ? "—" : formatCurrency(q.requiredOccurrence)} / ${q.requiredAggregate === null ? "—" : formatCurrency(q.requiredAggregate)}`}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {r.status === "missing" ? (
                        <span className="text-muted-foreground">No policy</span>
                      ) : statutory ? (
                        "Policy in force"
                      ) : (
                        <>
                          {r.providedOccurrence === null ? "—" : formatCurrency(r.providedOccurrence)} / {r.providedAggregate === null ? "—" : formatCurrency(r.providedAggregate)}
                          {r.umbrellaCounted > 0 ? <span className="block text-xs text-muted-foreground">incl. {formatCurrency(r.umbrellaCounted)} umbrella/excess</span> : null}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {r.status === "missing" ? (
                        "—"
                      ) : r.shortfallOccurrence === 0 && r.shortfallAggregate === 0 ? (
                        <span className="text-muted-foreground">None</span>
                      ) : (
                        <>
                          {r.shortfallOccurrence > 0 ? <span className="block">{formatCurrency(r.shortfallOccurrence)} occurrence</span> : null}
                          {r.shortfallAggregate > 0 ? <span className="block">{formatCurrency(r.shortfallAggregate)} aggregate</span> : null}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="min-w-44 whitespace-normal text-xs">
                      {q.requiredEndorsements.length === 0 ? (
                        <span className="text-muted-foreground">None required</span>
                      ) : (
                        <span className="flex flex-col gap-0.5">
                          {r.endorsementsPresent.map((e) => (
                            <span key={e}>✓ {ENDORSEMENT_LABELS[e]}</span>
                          ))}
                          {r.endorsementsMissing.map((e) => (
                            <span key={e} className="text-destructive">
                              ✗ {ENDORSEMENT_LABELS[e]} missing
                            </span>
                          ))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "meets" ? "default" : r.status === "shortfall" ? "secondary" : "destructive"}>
                        {r.status === "shortfall" && (r.shortfallOccurrence > 0 || r.shortfallAggregate > 0)
                          ? `Shortfall ${formatCurrency(Math.max(r.shortfallOccurrence, r.shortfallAggregate))}`
                          : REQUIREMENT_STATUS_LABELS[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit requirement ${q.coverage} for ${q.contractName}`} onClick={() => setEditing({ mode: "edit", r })}>
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete requirement ${q.coverage} for ${q.contractName}`} onClick={() => setDeleting(r)}>
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
      <p className="text-xs text-muted-foreground">
        Meets, Shortfall or Missing coverage describe the comparison only; whether a contract is satisfied is a decision for you and the counterparty.
      </p>
      {results.length > 0 ? <ShowMath lines={mathLines} /> : null}

      {editing ? (
        <RequirementDialog
          key={editing.mode === "edit" ? editing.r.requirement.id : "new"}
          slug={slug}
          accountId={accountId}
          editing={editing}
          notes={editing.mode === "edit" ? (notesById[editing.r.requirement.id] ?? "") : ""}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this requirement?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `${deleting.requirement.coverage} for ${deleting.requirement.contractName}. ` : ""}This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={pending}>
              {pending ? "Removing…" : "Remove requirement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function RequirementDialog({ slug, accountId, editing, notes, onClose }: { slug: string; accountId: string; editing: NonNullable<Editing>; notes: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const q = editing.mode === "edit" ? editing.r.requirement : null;
  const defaults: RequirementFormInput = q
    ? { contractName: q.contractName, counterparty: q.counterparty, coverage: q.coverage, requiredOccurrence: str(q.requiredOccurrence), requiredAggregate: str(q.requiredAggregate), requiredEndorsements: q.requiredEndorsements, notes }
    : { contractName: "", counterparty: "", coverage: "General Liability", requiredOccurrence: "", requiredAggregate: "", requiredEndorsements: [], notes: "" };
  const { register, handleSubmit, formState, getValues, setError, control } = useForm<RequirementFormInput, unknown, RequirementFormValues>({
    resolver: zodResolver(requirementFormSchema),
    defaultValues: defaults,
    mode: "onChange",
  });
  const msg = (k: keyof RequirementFormInput) => formState.errors[k]?.message;
  const coverage = useWatch({ control, name: "coverage" });

  function onSubmit() {
    const raw = getValues();
    startTransition(async () => {
      const res = await saveRequirement(slug, accountId, q?.id ?? null, raw);
      if (!res.ok) {
        toast.error(res.message);
        for (const [field, message] of Object.entries(res.fieldErrors ?? {})) setError(field as keyof RequirementFormInput, { message });
        return;
      }
      toast.success(q ? "Requirement saved" : "Requirement added");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{q ? "Edit requirement" : "Add requirement"}</DialogTitle>
            <DialogDescription>One row per coverage the contract requires. Counterparties are fictional in the demo.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="req-contract" label="Contract name" required error={msg("contractName")} className="flex flex-col gap-1.5 sm:col-span-2">
              <Input {...register("contractName")} {...fieldA11y("req-contract", msg("contractName"))} autoComplete="off" />
            </Field>
            <Field id="req-counterparty" label="Counterparty" required error={msg("counterparty")}>
              <Input {...register("counterparty")} {...fieldA11y("req-counterparty", msg("counterparty"))} autoComplete="off" />
            </Field>
            <Field id="req-coverage" label="Coverage" required error={msg("coverage")}>
              <NativeSelect {...register("coverage")} {...fieldA11y("req-coverage", msg("coverage"))}>
                {REQUIREMENT_COVERAGES.map((c) => (
                  <option key={c} value={c}>
                    {c === "Workers Compensation" ? "Workers Compensation (statutory)" : c}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="req-occ" label={coverage === "Commercial Auto" ? "Required limit (combined single limit)" : "Required per occurrence (CAD)"} required={coverage !== "Workers Compensation"} error={msg("requiredOccurrence")}>
              <Input {...register("requiredOccurrence")} {...fieldA11y("req-occ", msg("requiredOccurrence"))} inputMode="decimal" />
            </Field>
            <Field id="req-agg" label="Required aggregate (CAD)" error={msg("requiredAggregate")}>
              <Input {...register("requiredAggregate")} {...fieldA11y("req-agg", msg("requiredAggregate"))} inputMode="decimal" />
            </Field>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Required endorsements</legend>
            {ENDORSEMENTS.map((e) => (
              <NativeCheckbox key={e} id={`req-end-${e}`} value={e} label={ENDORSEMENT_LABELS[e]} {...register("requiredEndorsements")} />
            ))}
          </fieldset>
          <Field id="req-notes" label="Notes" error={msg("notes")}>
            <Textarea {...register("notes")} {...fieldA11y("req-notes", msg("notes"))} rows={2} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formState.isValid || pending}>
              {pending ? "Saving…" : "Save requirement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
