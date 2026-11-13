"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeSelect } from "@/components/form/NativeSelect";
import { Missing } from "@/components/Missing";
import { ShowMath } from "@/components/dashboard/ShowMath";
import { PARTICIPANT_ROLES, type ParticipantRole } from "@/lib/constants";
import { analyzeParticipation } from "@/lib/domain/program";
import { formatCurrency, formatRatioPercent } from "@/lib/format";
import { participantFormSchema, type ParticipantFormInput, type ParticipantFormValues } from "@/lib/schemas/program";
import { deleteParticipant, saveParticipant } from "@/server/program/actions";

export interface ParticipantRow {
  id: string;
  carrier: string;
  role: ParticipantRole;
  signedLine: number;
  premium: number | null;
  notes: string | null;
}

interface Props {
  slug: string;
  policyId: string;
  policyCarrier: string;
  policyPremium: number;
  occurrenceLimit: number | null;
  rows: ParticipantRow[];
}

type Editing = { mode: "create" } | { mode: "edit"; p: ParticipantRow } | null;
const str = (n: number | null) => (n === null ? "" : String(n));

/** Co-insurers on a larger placement: signed lines, premium shares and rate on line. */
export function ParticipantsSection({ slug, policyId, policyCarrier, policyPremium, occurrenceLimit, rows }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<ParticipantRow | null>(null);
  const analysis = analyzeParticipation(rows, { annualPremium: policyPremium, occurrenceLimit });
  const a = analysis.value;

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    startTransition(async () => {
      const res = await deleteParticipant(slug, target.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`Removed ${target.carrier}`);
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="participants-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="participants-heading" className="text-lg font-semibold">
          Insurers on this placement
        </h2>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ mode: "create" })}>
          <Plus aria-hidden="true" />
          Add insurer
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          Placed 100% with {policyCarrier}. For a larger placement shared between insurers, add each one with its signed line and premium.
        </p>
      ) : (
        <>
          {a.findings.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {a.findings.map((f) => (
                <li key={f} className="flex items-start gap-2 rounded-lg border border-amber-500/60 bg-amber-50 p-2 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Insurer</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Signed line</TableHead>
                  <TableHead className="text-right">Share of limit</TableHead>
                  <TableHead className="text-right">Premium</TableHead>
                  <TableHead className="text-right">Share of premium</TableHead>
                  <TableHead className="text-right">Rate on line</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.participants.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.carrier}
                      {rows.find((r) => r.id === p.id)?.notes ? <span className="block text-xs text-muted-foreground">{rows.find((r) => r.id === p.id)!.notes}</span> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.role === "lead" ? "default" : "outline"}>{p.role === "lead" ? "Lead" : "Follow"}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.signedLine}%</TableCell>
                    <TableCell className="text-right tabular-nums">{p.limitShare === null ? <Missing what="Share of limit (no occurrence limit)" /> : formatCurrency(p.limitShare)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.premium === null ? <Missing what="Premium" /> : formatCurrency(p.premium)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.premiumShare === null ? "—" : formatRatioPercent(p.premiumShare)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.rateOnLine === null ? "—" : `${(p.rateOnLine * 100).toFixed(2)}%`}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${p.carrier}`} onClick={() => setEditing({ mode: "edit", p: rows.find((r) => r.id === p.id)! })}>
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${p.carrier}`} onClick={() => setDeleting(rows.find((r) => r.id === p.id)!)}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableHead scope="row" className="font-semibold">
                    Total
                  </TableHead>
                  <TableCell />
                  <TableCell className="text-right font-semibold tabular-nums">{a.totalSignedLine}%</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-semibold tabular-nums">{a.totalPremium === null ? "—" : formatCurrency(a.totalPremium)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">of {formatCurrency(policyPremium)}</TableCell>
                  <TableCell />
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          <ShowMath lines={analysis.math.steps.lines as string[]} />
        </>
      )}

      {editing ? <ParticipantDialog key={editing.mode === "edit" ? editing.p.id : "new"} slug={slug} policyId={policyId} editing={editing} onClose={() => setEditing(null)} /> : null}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.carrier} from the placement?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={pending}>
              {pending ? "Removing…" : "Remove insurer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function ParticipantDialog({ slug, policyId, editing, onClose }: { slug: string; policyId: string; editing: NonNullable<Editing>; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const p = editing.mode === "edit" ? editing.p : null;
  const defaults: ParticipantFormInput = p
    ? { carrier: p.carrier, role: p.role, signedLine: String(p.signedLine), premium: str(p.premium), notes: p.notes ?? "" }
    : { carrier: "", role: "follow", signedLine: "", premium: "", notes: "" };
  const { register, handleSubmit, formState, getValues, setError } = useForm<ParticipantFormInput, unknown, ParticipantFormValues>({
    resolver: zodResolver(participantFormSchema),
    defaultValues: defaults,
    mode: "onChange",
  });
  const msg = (k: keyof ParticipantFormInput) => formState.errors[k]?.message;

  function onSubmit() {
    const raw = getValues();
    startTransition(async () => {
      const res = await saveParticipant(slug, policyId, p?.id ?? null, raw);
      if (!res.ok) {
        toast.error(res.message);
        for (const [field, message] of Object.entries(res.fieldErrors ?? {})) setError(field as keyof ParticipantFormInput, { message });
        return;
      }
      toast.success(p ? "Insurer saved" : "Insurer added");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{p ? "Edit insurer" : "Add insurer"}</DialogTitle>
            <DialogDescription>Signed line is this insurer&apos;s percentage of the placement; lines should total 100%.</DialogDescription>
          </DialogHeader>
          <Field id="part-carrier" label="Insurer" required error={msg("carrier")}>
            <Input {...register("carrier")} {...fieldA11y("part-carrier", msg("carrier"))} autoComplete="off" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="part-role" label="Role" required error={msg("role")}>
              <NativeSelect {...register("role")} {...fieldA11y("part-role", msg("role"))}>
                {PARTICIPANT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r === "lead" ? "Lead" : "Follow"}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="part-line" label="Signed line (%)" required error={msg("signedLine")}>
              <Input {...register("signedLine")} {...fieldA11y("part-line", msg("signedLine"))} inputMode="decimal" />
            </Field>
            <Field id="part-premium" label="Premium (CAD)" error={msg("premium")} hint="This insurer's share">
              <Input {...register("premium")} {...fieldA11y("part-premium", msg("premium"), "hint")} inputMode="decimal" />
            </Field>
            <Field id="part-notes" label="Notes" error={msg("notes")}>
              <Input {...register("notes")} {...fieldA11y("part-notes", msg("notes"))} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formState.isValid || pending}>
              {pending ? "Saving…" : "Save insurer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
