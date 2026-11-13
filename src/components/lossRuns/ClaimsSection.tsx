"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
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
import { ValueOrMissing } from "@/components/Missing";
import { CLAIM_STATUSES, LINES_OF_BUSINESS, type ClaimStatus, type LineOfBusiness } from "@/lib/constants";
import { CLAIM_FLAG_LABELS, type ClaimFlag } from "@/lib/domain/lossRuns";
import { parseCurrencyInput } from "@/lib/domain/money";
import { formatCurrency, formatDate } from "@/lib/format";
import { claimFormSchema, type ClaimFormInput, type ClaimFormValues } from "@/lib/schemas/claim";
import { createClaim, deleteClaim, updateClaim } from "@/server/lossRuns/actions";

export interface ClaimRowView {
  id: string;
  lineOfBusiness: LineOfBusiness;
  claimNumber: string;
  policyId: string | null;
  dateOfLoss: string;
  dateReported: string;
  description: string | null;
  paid: number;
  reserved: number;
  incurred: number;
  status: ClaimStatus;
  policyYear: string | null;
  flags: ClaimFlag[];
}

export interface PolicyOptionView {
  id: string;
  line: LineOfBusiness;
  label: string;
}

interface Props {
  slug: string;
  accountId: string;
  asOf: string;
  line: LineOfBusiness;
  claims: ClaimRowView[];
  policyOptions: PolicyOptionView[];
  /** Every claim number on the account, for the live duplicate warning. */
  claimNumbers: { id: string; number: string }[];
}

type Editing = { mode: "create" } | { mode: "edit"; claim: ClaimRowView } | null;

export function ClaimsSection({ slug, accountId, asOf, line, claims, policyOptions, claimNumbers }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<ClaimRowView | null>(null);

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    startTransition(async () => {
      const res = await deleteClaim(slug, target.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`Deleted claim ${target.claimNumber}`);
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="claims-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="claims-heading" className="text-lg font-semibold">
          Claims, {line}
        </h2>
        <Button type="button" size="sm" onClick={() => setEditing({ mode: "create" })}>
          <Plus aria-hidden="true" />
          Add claim
        </Button>
      </div>
      {claims.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">No {line} claims on this account. Add one or import a loss run CSV.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Claim</TableHead>
                <TableHead>Policy year</TableHead>
                <TableHead>Loss / reported</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Incurred</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {c.claimNumber}
                    {c.flags.length > 0 ? (
                      <span className="mt-1 flex flex-col gap-1">
                        {c.flags.map((f) => (
                          <Badge key={f} variant="outline" className="gap-1 border-amber-500/60 text-xs font-normal">
                            <AlertTriangle className="size-3" aria-hidden="true" />
                            {CLAIM_FLAG_LABELS[f]}
                          </Badge>
                        ))}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{c.policyYear ?? <span className="text-muted-foreground">Outside known policy periods</span>}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(c.dateOfLoss)}
                    <span className="block text-xs text-muted-foreground">Reported {formatDate(c.dateReported)}</span>
                  </TableCell>
                  <TableCell className="max-w-72 min-w-48 whitespace-normal">
                    <ValueOrMissing text={c.description} what="Description" />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(c.paid)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(c.reserved)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatCurrency(c.incurred)}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "open" ? "default" : "outline"}>{c.status === "open" ? "Open" : "Closed"}</Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit claim ${c.claimNumber}`} onClick={() => setEditing({ mode: "edit", claim: c })}>
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete claim ${c.claimNumber}`} onClick={() => setDeleting(c)}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing ? (
        <ClaimDialog
          key={editing.mode === "edit" ? editing.claim.id : "new"}
          slug={slug}
          accountId={accountId}
          asOf={asOf}
          line={line}
          editing={editing}
          policyOptions={policyOptions}
          claimNumbers={claimNumbers}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete claim {deleting?.claimNumber}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the claim from the loss run and every summary. It cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={pending}>
              {pending ? "Deleting…" : "Delete claim"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function ClaimDialog({
  slug,
  accountId,
  asOf,
  line,
  editing,
  policyOptions,
  claimNumbers,
  onClose,
}: {
  slug: string;
  accountId: string;
  asOf: string;
  line: LineOfBusiness;
  editing: NonNullable<Editing>;
  policyOptions: PolicyOptionView[];
  claimNumbers: { id: string; number: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const c = editing.mode === "edit" ? editing.claim : null;
  const defaults: ClaimFormInput = c
    ? {
        lineOfBusiness: c.lineOfBusiness,
        policyId: c.policyId ?? "",
        claimNumber: c.claimNumber,
        dateOfLoss: c.dateOfLoss,
        dateReported: c.dateReported,
        description: c.description ?? "",
        paid: String(c.paid),
        reserved: String(c.reserved),
        status: c.status,
        confirmClosedWithReserve: c.status === "closed" && c.reserved > 0,
      }
    : {
        lineOfBusiness: line,
        policyId: "",
        claimNumber: "",
        dateOfLoss: "",
        dateReported: "",
        description: "",
        paid: "0",
        reserved: "0",
        status: "open",
        confirmClosedWithReserve: false,
      };
  const { register, handleSubmit, formState, getValues, setError, control, trigger } = useForm<ClaimFormInput, unknown, ClaimFormValues>({
    resolver: zodResolver(claimFormSchema(asOf)),
    defaultValues: defaults,
    mode: "onChange",
  });
  const msg = (k: keyof ClaimFormInput) => formState.errors[k]?.message;
  const chosenLine = useWatch({ control, name: "lineOfBusiness" });
  const status = useWatch({ control, name: "status" });
  const reservedRaw = useWatch({ control, name: "reserved" });
  const number = useWatch({ control, name: "claimNumber" });
  const reserved = parseCurrencyInput(reservedRaw ?? "").value;
  const closedWithReserve = status === "closed" && reserved !== null && reserved > 0;
  const duplicate = !!number?.trim() && claimNumbers.some((n) => n.id !== c?.id && n.number.trim().toLowerCase() === number.trim().toLowerCase());
  const lineOptions = policyOptions.filter((p) => p.line === chosenLine);

  function onSubmit() {
    const raw = getValues();
    startTransition(async () => {
      const res = c ? await updateClaim(slug, c.id, raw) : await createClaim(slug, accountId, raw);
      if (!res.ok) {
        toast.error(res.message);
        for (const [field, message] of Object.entries(res.fieldErrors ?? {})) setError(field as keyof ClaimFormInput, { message });
        return;
      }
      toast.success(c ? "Claim saved" : "Claim added", res.data.duplicate ? { description: "The claim number is already used on this account, so it is flagged." } : undefined);
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{c ? `Edit claim ${c.claimNumber}` : "Add claim"}</DialogTitle>
            <DialogDescription>Incurred is paid plus reserved. The policy year comes from the date of loss.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="claim-number" label="Claim number" required error={msg("claimNumber")} hint={duplicate ? "Already used on this account; it will be flagged as a duplicate." : undefined}>
              <Input {...register("claimNumber")} {...fieldA11y("claim-number", msg("claimNumber"), duplicate ? "hint" : undefined)} autoComplete="off" />
            </Field>
            <Field id="claim-line" label="Line of business" required error={msg("lineOfBusiness")}>
              <NativeSelect {...register("lineOfBusiness")} {...fieldA11y("claim-line", msg("lineOfBusiness"))}>
                {LINES_OF_BUSINESS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="claim-policy" label="Policy" error={msg("policyId")} hint="Leave on automatic to link the policy whose term contains the date of loss." className="flex flex-col gap-1.5 sm:col-span-2">
              <NativeSelect {...register("policyId")} {...fieldA11y("claim-policy", msg("policyId"), "hint")}>
                <option value="">Automatic (by date of loss)</option>
                {lineOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="claim-loss" label="Date of loss" required error={msg("dateOfLoss")}>
              <Input
                type="date"
                {...register("dateOfLoss", { onChange: () => void trigger("dateReported") })}
                {...fieldA11y("claim-loss", msg("dateOfLoss"))}
                max={asOf}
              />
            </Field>
            <Field id="claim-reported" label="Date reported" required error={msg("dateReported")} hint={`On or after the loss; not after ${formatDate(asOf)}.`}>
              <Input type="date" {...register("dateReported")} {...fieldA11y("claim-reported", msg("dateReported"), "hint")} max={asOf} />
            </Field>
            <Field id="claim-paid" label="Paid (CAD)" required error={msg("paid")}>
              <Input {...register("paid")} {...fieldA11y("claim-paid", msg("paid"))} inputMode="decimal" />
            </Field>
            <Field id="claim-reserved" label="Reserved (CAD)" required error={msg("reserved")}>
              <Input {...register("reserved", { onChange: () => void trigger("confirmClosedWithReserve") })} {...fieldA11y("claim-reserved", msg("reserved"))} inputMode="decimal" />
            </Field>
            <Field id="claim-status" label="Status" required error={msg("status")}>
              <NativeSelect {...register("status", { onChange: () => void trigger("confirmClosedWithReserve") })} {...fieldA11y("claim-status", msg("status"))}>
                {CLAIM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s === "open" ? "Open" : "Closed"}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="claim-description" label="Description" error={msg("description")} className="flex flex-col gap-1.5 sm:col-span-2">
              <Textarea {...register("description")} {...fieldA11y("claim-description", msg("description"))} rows={3} />
            </Field>
          </div>
          {closedWithReserve ? (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-500/60 bg-amber-50 p-3 text-sm" role="alert">
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                This claim is closed but still carries a reserve of {formatCurrency(reserved)}. That happens with reopened files; otherwise set the reserve to 0.
              </p>
              <NativeCheckbox id="confirm-reserve" label="Yes, save it closed with a reserve" {...register("confirmClosedWithReserve")} />
              {msg("confirmClosedWithReserve") ? <p className="text-xs text-destructive">{msg("confirmClosedWithReserve")}</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formState.isValid || pending}>
              {pending ? "Saving…" : "Save claim"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
