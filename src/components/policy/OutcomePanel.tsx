"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Flag, Undo2 } from "lucide-react";
import { toast } from "sonner";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeSelect } from "@/components/form/NativeSelect";
import { LOST_REASONS, LOST_REASON_LABELS, OUTCOME_TYPE_LABELS, type LostReason, type OutcomeType } from "@/lib/constants";
import { planSuccessorTerm, getRateMetrics } from "@/lib/domain/renewals";
import { parseCurrencyInput } from "@/lib/domain/money";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  lostOutcomeSchema,
  nonRenewedOutcomeSchema,
  renewedOutcomeSchema,
  type LostOutcomeInput,
  type LostOutcomeValues,
  type NonRenewedOutcomeInput,
  type NonRenewedOutcomeValues,
  type RenewedOutcomeInput,
  type RenewedOutcomeValues,
} from "@/lib/schemas/outcome";
import { recordLostOutcome, recordNonRenewedOutcome, recordRenewedOutcome, undoOutcome } from "@/server/outcomes/actions";
import type { ExposureBasis } from "@/lib/constants";

export interface ExpiringSummary {
  id: string;
  carrier: string;
  expiryDate: string;
  annualPremium: number;
  exposureAmount: number | null;
  exposureBasis: ExposureBasis;
  deductible: number | null;
  occurrenceLimit: number | null;
  aggregateLimit: number | null;
  commissionRate: number;
}

export interface OutcomeSummary {
  outcome: OutcomeType;
  lostReason: LostReason | null;
  reason: string | null;
  competingPremium: number | null;
  recordedAsOf: string;
  priorStatusLabel: string;
  successor: { href: string; label: string } | null;
  successorHasOutcome: boolean;
}

/** Terms of the quote bound in Marketing, used to prefill the Renewed form. */
export interface BoundPrefill {
  carrier: string;
  premium: number;
  exposureAmount: number | null;
  deductible: number | null;
  occurrenceLimit: number | null;
  aggregateLimit: number | null;
  commissionRate: number;
}

interface Props {
  slug: string;
  policy: ExpiringSummary;
  outcome: OutcomeSummary | null;
  prefill?: BoundPrefill | null;
  /** Open the Renewed form straight away (arriving from Bind in Marketing). */
  autoOpen?: boolean;
}

const str = (n: number | null) => (n === null ? "" : String(n));

export function OutcomePanel({ slug, policy, outcome, prefill = null, autoOpen = false }: Props) {
  return (
    <section aria-labelledby="outcome-heading" className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 id="outcome-heading" className="text-lg font-semibold">
        Renewal outcome
      </h2>
      {outcome ? <RecordedOutcome slug={slug} policyId={policy.id} outcome={outcome} /> : <RecordOutcome slug={slug} policy={policy} prefill={prefill} autoOpen={autoOpen && prefill !== null} />}
    </section>
  );
}

function RecordedOutcome({ slug, policyId, outcome }: { slug: string; policyId: string; outcome: OutcomeSummary }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function confirmUndo() {
    startTransition(async () => {
      const res = await undoOutcome(slug, policyId);
      if (!res.ok) {
        toast.error(res.message);
        setOpen(false);
        return;
      }
      toast.success("Outcome undone", { description: `Status restored to ${outcome.priorStatusLabel}.` });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Outcome</dt>
          <dd className="font-medium">{OUTCOME_TYPE_LABELS[outcome.outcome]}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Recorded</dt>
          <dd>As of {formatDate(outcome.recordedAsOf)}</dd>
        </div>
        {outcome.lostReason ? (
          <div>
            <dt className="text-xs text-muted-foreground">Reason</dt>
            <dd>{LOST_REASON_LABELS[outcome.lostReason]}</dd>
          </div>
        ) : null}
        {outcome.outcome === "lost" ? (
          <div>
            <dt className="text-xs text-muted-foreground">Competing premium</dt>
            <dd>{outcome.competingPremium === null ? "Not known" : formatCurrency(outcome.competingPremium)}</dd>
          </div>
        ) : null}
        {outcome.reason ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">{outcome.outcome === "non_renewed" ? "Carrier's reason" : "Details"}</dt>
            <dd className="whitespace-pre-line">{outcome.reason}</dd>
          </div>
        ) : null}
        {outcome.successor ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Successor policy</dt>
            <dd>
              <Link href={outcome.successor.href} className="underline-offset-4 hover:underline">
                {outcome.successor.label}
              </Link>
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="text-xs text-muted-foreground">Outcomes cannot be edited. To change one, undo it and record it again.</p>
      <div>
        <Button type="button" variant="outline" onClick={() => setOpen(true)} disabled={pending || outcome.successorHasOutcome}>
          <Undo2 aria-hidden="true" />
          Undo outcome
        </Button>
        {outcome.successorHasOutcome ? (
          <p className="mt-2 text-xs text-muted-foreground">The successor policy already has its own outcome. Undo that one first.</p>
        ) : null}
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this outcome?</AlertDialogTitle>
            <AlertDialogDescription>
              {outcome.successor
                ? `This deletes the successor policy (${outcome.successor.label}) together with its checklist and tasks, `
                : "This "}
              restores the renewal status to {outcome.priorStatusLabel} and records the undo in the activity log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmUndo} disabled={pending}>
              {pending ? "Undoing…" : "Undo outcome"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RecordOutcome({ slug, policy, prefill, autoOpen }: { slug: string; policy: ExpiringSummary; prefill: BoundPrefill | null; autoOpen: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  const [type, setType] = useState<OutcomeType>("renewed");
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-muted-foreground">No outcome recorded. When the renewal is decided, record whether it renewed, was lost, or was non-renewed by the carrier.</p>
      <div>
        <Button type="button" onClick={() => setOpen(true)}>
          <Flag aria-hidden="true" />
          Record outcome
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Record outcome</DialogTitle>
            <DialogDescription>Outcomes are permanent unless undone.</DialogDescription>
          </DialogHeader>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">What happened?</legend>
            {(["renewed", "lost", "non_renewed"] as const).map((t) => (
              <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name="outcome-type" value={t} checked={type === t} onChange={() => setType(t)} className="size-4 accent-primary" />
                {OUTCOME_TYPE_LABELS[t]}
              </label>
            ))}
          </fieldset>
          {type === "renewed" && prefill ? (
            <p className="rounded-lg bg-muted/60 p-2 text-sm" role="status">
              Prefilled from the quote bound with {prefill.carrier} in Marketing. Check the terms, then record.
            </p>
          ) : null}
          {type === "renewed" ? <RenewedForm slug={slug} policy={policy} prefill={prefill} onDone={() => setOpen(false)} /> : null}
          {type === "lost" ? <LostForm slug={slug} policy={policy} onDone={() => setOpen(false)} /> : null}
          {type === "non_renewed" ? <NonRenewedForm slug={slug} policy={policy} onDone={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function useSubmit(onDone: () => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function submit(run: () => Promise<{ ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string> }>, setError: (k: string, m: string) => void, success: string) {
    startTransition(async () => {
      const res = await run();
      if (!res.ok) {
        toast.error(res.message);
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k, m);
        return;
      }
      toast.success(success);
      onDone();
      router.refresh();
    });
  }
  return { pending, submit };
}

function RenewedForm({ slug, policy, prefill, onDone }: { slug: string; policy: ExpiringSummary; prefill: BoundPrefill | null; onDone: () => void }) {
  const schema = renewedOutcomeSchema({ occurrenceLimit: policy.occurrenceLimit !== null, aggregateLimit: policy.aggregateLimit !== null });
  const { register, handleSubmit, formState, getValues, setError, control } = useForm<RenewedOutcomeInput, unknown, RenewedOutcomeValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      renewalCarrier: prefill?.carrier ?? policy.carrier,
      renewalPremium: prefill ? String(prefill.premium) : "",
      renewalExposureAmount: prefill ? str(prefill.exposureAmount ?? policy.exposureAmount) : "",
      renewalDeductible: str(prefill ? prefill.deductible : policy.deductible),
      renewalOccurrenceLimit: str(prefill ? prefill.occurrenceLimit : policy.occurrenceLimit),
      renewalAggregateLimit: str(prefill ? prefill.aggregateLimit : policy.aggregateLimit),
      renewalCommissionRate: String(prefill?.commissionRate ?? policy.commissionRate),
    },
    mode: "onChange",
  });
  const { pending, submit } = useSubmit(onDone);
  const msg = (k: keyof RenewedOutcomeInput) => formState.errors[k]?.message;
  const term = planSuccessorTerm(policy.expiryDate).value;

  // Live preview of the rate-change sentence, from the same domain function the policy page uses.
  const premiumRaw = useWatch({ control, name: "renewalPremium" });
  const exposureRaw = useWatch({ control, name: "renewalExposureAmount" });
  const premium = parseCurrencyInput(premiumRaw ?? "").value;
  const exposure = parseCurrencyInput(exposureRaw ?? "").value;
  const preview =
    premium !== null
      ? getRateMetrics(
          { premium: policy.annualPremium, exposureAmount: policy.exposureAmount, exposureBasis: policy.exposureBasis },
          { premium, exposureAmount: exposure, exposureBasis: policy.exposureBasis },
        ).value.sentence
      : null;

  return (
    <form
      onSubmit={handleSubmit(() =>
        submit(() => recordRenewedOutcome(slug, policy.id, getValues()), (k, m) => setError(k as keyof RenewedOutcomeInput, { message: m }), "Renewed: renewal policy created"),
      )}
      noValidate
      className="flex flex-col gap-4"
    >
      <p className="text-xs text-muted-foreground">
        Creates a successor policy from {formatDate(term.effectiveDate)} to {formatDate(term.expiryDate)} and marks this expiring policy renewed. Limits, deductible and
        commission default to the expiring terms.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="renewalCarrier" label="Renewal carrier" required error={msg("renewalCarrier")}>
          <Input {...register("renewalCarrier")} {...fieldA11y("renewalCarrier", msg("renewalCarrier"))} />
        </Field>
        <Field id="renewalPremium" label="Renewal premium (CAD)" required error={msg("renewalPremium")} hint={`Expiring ${formatCurrency(policy.annualPremium)}`}>
          <Input {...register("renewalPremium")} {...fieldA11y("renewalPremium", msg("renewalPremium"), "hint")} inputMode="decimal" />
        </Field>
        <Field
          id="renewalExposureAmount"
          label="Renewal exposure amount"
          required
          error={msg("renewalExposureAmount")}
          hint={policy.exposureAmount === null ? "Expiring exposure not entered" : `Expiring ${policy.exposureAmount.toLocaleString("en-CA")} (${policy.exposureBasis.replace("_", " ")})`}
        >
          <Input {...register("renewalExposureAmount")} {...fieldA11y("renewalExposureAmount", msg("renewalExposureAmount"), "hint")} inputMode="decimal" />
        </Field>
        <Field id="renewalDeductible" label="Renewal deductible (CAD)" required error={msg("renewalDeductible")} hint="Enter 0 if none">
          <Input {...register("renewalDeductible")} {...fieldA11y("renewalDeductible", msg("renewalDeductible"), "hint")} inputMode="decimal" />
        </Field>
        <Field id="renewalOccurrenceLimit" label="Occurrence limit (CAD)" required={policy.occurrenceLimit !== null} error={msg("renewalOccurrenceLimit")}>
          <Input {...register("renewalOccurrenceLimit")} {...fieldA11y("renewalOccurrenceLimit", msg("renewalOccurrenceLimit"))} inputMode="decimal" />
        </Field>
        <Field id="renewalAggregateLimit" label="Aggregate limit (CAD)" required={policy.aggregateLimit !== null} error={msg("renewalAggregateLimit")}>
          <Input {...register("renewalAggregateLimit")} {...fieldA11y("renewalAggregateLimit", msg("renewalAggregateLimit"))} inputMode="decimal" />
        </Field>
        <Field id="renewalCommissionRate" label="Commission rate (%)" required error={msg("renewalCommissionRate")}>
          <Input {...register("renewalCommissionRate")} {...fieldA11y("renewalCommissionRate", msg("renewalCommissionRate"))} inputMode="decimal" />
        </Field>
      </div>
      {preview ? (
        <p className="rounded-lg bg-muted/60 p-2 text-sm" aria-live="polite">
          {preview}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!formState.isValid || pending}>
          {pending ? "Saving…" : "Record renewed"}
        </Button>
      </div>
    </form>
  );
}

function LostForm({ slug, policy, onDone }: { slug: string; policy: ExpiringSummary; onDone: () => void }) {
  const { register, handleSubmit, formState, getValues, setError } = useForm<LostOutcomeInput, unknown, LostOutcomeValues>({
    resolver: zodResolver(lostOutcomeSchema),
    defaultValues: { lostReason: "" as LostReason, competingPremium: "", details: "" },
    mode: "onChange",
  });
  const { pending, submit } = useSubmit(onDone);
  const msg = (k: keyof LostOutcomeInput) => formState.errors[k]?.message;
  return (
    <form
      onSubmit={handleSubmit(() =>
        submit(() => recordLostOutcome(slug, policy.id, getValues()), (k, m) => setError(k as keyof LostOutcomeInput, { message: m }), "Recorded as lost"),
      )}
      noValidate
      className="flex flex-col gap-4"
    >
      <Field id="lostReason" label="Reason" required error={msg("lostReason")}>
        <NativeSelect {...register("lostReason")} {...fieldA11y("lostReason", msg("lostReason"))}>
          <option value="">Choose a reason</option>
          {LOST_REASONS.map((r) => (
            <option key={r} value={r}>
              {LOST_REASON_LABELS[r]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="competingPremium" label="Competing premium (CAD), if known" error={msg("competingPremium")} hint={`Expiring ${formatCurrency(policy.annualPremium)}`}>
        <Input {...register("competingPremium")} {...fieldA11y("competingPremium", msg("competingPremium"), "hint")} inputMode="decimal" />
      </Field>
      <Field id="lostDetails" label="Details" error={msg("details")}>
        <Textarea {...register("details")} {...fieldA11y("lostDetails", msg("details"))} rows={3} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!formState.isValid || pending}>
          {pending ? "Saving…" : "Record lost"}
        </Button>
      </div>
    </form>
  );
}

function NonRenewedForm({ slug, policy, onDone }: { slug: string; policy: ExpiringSummary; onDone: () => void }) {
  const { register, handleSubmit, formState, getValues, setError } = useForm<NonRenewedOutcomeInput, unknown, NonRenewedOutcomeValues>({
    resolver: zodResolver(nonRenewedOutcomeSchema),
    defaultValues: { reason: "" },
    mode: "onChange",
  });
  const { pending, submit } = useSubmit(onDone);
  return (
    <form
      onSubmit={handleSubmit(() =>
        submit(() => recordNonRenewedOutcome(slug, policy.id, getValues()), (k, m) => setError(k as keyof NonRenewedOutcomeInput, { message: m }), "Recorded as non-renewed"),
      )}
      noValidate
      className="flex flex-col gap-4"
    >
      <Field id="nonRenewReason" label="Carrier's reason" required error={formState.errors.reason?.message}>
        <Textarea {...register("reason")} {...fieldA11y("nonRenewReason", formState.errors.reason?.message)} rows={3} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!formState.isValid || pending}>
          {pending ? "Saving…" : "Record non-renewed"}
        </Button>
      </div>
    </form>
  );
}
