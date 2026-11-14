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
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeSelect } from "@/components/form/NativeSelect";
import { NativeCheckbox } from "@/components/form/Checkbox";
import {
  DECLINE_REASONS,
  DECLINE_REASON_LABELS,
  ENDORSEMENTS,
  ENDORSEMENT_LABELS,
  SUBMISSION_STATUS_LABELS,
  type DeclineReason,
  type Endorsement,
  type SubmissionStatus,
} from "@/lib/constants";
import { addDays } from "@/lib/domain/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  declineFormSchema,
  quoteFormSchema,
  submissionFormSchema,
  type DeclineFormInput,
  type DeclineFormValues,
  type QuoteFormInput,
  type QuoteFormValues,
  type SubmissionFormInput,
  type SubmissionFormValues,
} from "@/lib/schemas/marketing";
import {
  bindQuote,
  createSubmission,
  declineSubmission,
  deleteQuote,
  deleteSubmission,
  saveQuote,
  setSubmissionStatus,
  unbindSubmission,
  updateSubmission,
} from "@/server/marketing/actions";

export interface QuoteView {
  id: string;
  premium: number;
  occurrenceLimit: number | null;
  aggregateLimit: number | null;
  deductible: number | null;
  endorsements: Endorsement[];
  commissionRate: number;
  exposureAmount: number | null;
  subjectivities: string | null;
  validUntil: string;
  isIncumbent: boolean;
  isBound: boolean;
  expired: boolean;
}

export interface SubmissionView {
  id: string;
  carrier: string;
  sentOn: string | null;
  respondedOn: string | null;
  status: SubmissionStatus;
  declinedReason: DeclineReason | null;
  notes: string | null;
  days: number | null;
  waiting: boolean;
  quotes: QuoteView[];
}

export interface ExpiringDefaults {
  carrier: string;
  occurrenceLimit: number | null;
  aggregateLimit: number | null;
  deductible: number | null;
  endorsements: Endorsement[];
  commissionRate: number;
  exposureAmount: number | null;
}

interface Props {
  slug: string;
  policyId: string;
  asOf: string;
  rows: SubmissionView[];
  expiring: ExpiringDefaults;
  policyHasOutcome: boolean;
}

type Dialogs =
  | { kind: "submission"; s: SubmissionView | null }
  | { kind: "decline"; s: SubmissionView }
  | { kind: "quote"; s: SubmissionView; q: QuoteView | null }
  | { kind: "delete-submission"; s: SubmissionView }
  | { kind: "delete-quote"; s: SubmissionView; q: QuoteView }
  | null;

const str = (n: number | null) => (n === null ? "" : String(n));
const statusVariant = (s: SubmissionStatus): "default" | "secondary" | "outline" | "destructive" =>
  s === "bound" ? "default" : s === "quoted" ? "secondary" : s === "declined" ? "destructive" : "outline";

export function SubmissionsSection({ slug, policyId, asOf, rows, expiring, policyHasOutcome }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const anyBound = rows.some((r) => r.status === "bound");

  function run(fn: () => Promise<{ ok: true } | { ok: false; message: string }>, success: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(success);
      setDialog(null);
      router.refresh();
    });
  }

  function bind(q: QuoteView, carrier: string) {
    startTransition(async () => {
      const res = await bindQuote(slug, q.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`Bound with ${carrier}`, { description: "Opening the Renewed outcome, prefilled with this quote." });
      router.push(res.data.policyUrl);
    });
  }

  return (
    <section aria-labelledby="carriers-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="carriers-heading" className="text-lg font-semibold">
          Carriers approached
        </h2>
        <Button type="button" size="sm" onClick={() => setDialog({ kind: "submission", s: null })}>
          <Plus aria-hidden="true" />
          Add carrier
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">No carriers approached yet. Add the incumbent and each market you plan to submit to.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.carrier}</span>
                    <Badge variant={statusVariant(s.status)}>{SUBMISSION_STATUS_LABELS[s.status]}</Badge>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {s.sentOn ? `Sent ${formatDate(s.sentOn)}` : "Not sent yet"}
                    {s.days !== null ? (s.waiting ? ` · waiting ${s.days} days` : ` · responded in ${s.days} days`) : ""}
                    {s.declinedReason ? ` · declined: ${DECLINE_REASON_LABELS[s.declinedReason]}` : ""}
                  </span>
                  {s.notes ? <span className="text-xs text-muted-foreground">{s.notes}</span> : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {s.status === "planned" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => (s.sentOn ? run(() => setSubmissionStatus(slug, s.id, "submitted"), `${s.carrier} marked submitted`) : setDialog({ kind: "submission", s }))}
                    >
                      Mark submitted
                    </Button>
                  ) : null}
                  {s.status === "submitted" || s.status === "quoted" ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ kind: "quote", s, q: null })}>
                      {s.status === "quoted" ? "Add option" : "Record quote"}
                    </Button>
                  ) : null}
                  {s.status === "submitted" || s.status === "quoted" ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ kind: "decline", s })}>
                      Declined
                    </Button>
                  ) : null}
                  {s.status === "submitted" ? (
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => setSubmissionStatus(slug, s.id, "no_response"), `${s.carrier} marked no response`)}>
                      No response
                    </Button>
                  ) : null}
                  {s.status === "declined" || s.status === "no_response" ? (
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => setSubmissionStatus(slug, s.id, "submitted"), `${s.carrier} reopened`)}>
                      Reopen
                    </Button>
                  ) : null}
                  {s.status === "bound" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending || policyHasOutcome}
                      title={policyHasOutcome ? "Undo the renewal outcome first" : undefined}
                      onClick={() => run(() => unbindSubmission(slug, s.id), `${s.carrier} unbound`)}
                    >
                      Unbind
                    </Button>
                  ) : null}
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${s.carrier}`} onClick={() => setDialog({ kind: "submission", s })}>
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${s.carrier}`} disabled={s.status === "bound"} onClick={() => setDialog({ kind: "delete-submission", s })}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>
              {s.quotes.length > 0 ? (
                <ul className="flex flex-col gap-1.5 border-t pt-2">
                  {s.quotes.map((q, i) => (
                    <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium tabular-nums">{formatCurrency(q.premium)}</span>
                        <span className="text-muted-foreground">
                          {s.quotes.length > 1 ? `Option ${i + 1} · ` : ""}
                          {q.occurrenceLimit === null ? "—" : formatCurrency(q.occurrenceLimit)} / {q.aggregateLimit === null ? "—" : formatCurrency(q.aggregateLimit)} · deductible{" "}
                          {q.deductible === null ? "—" : formatCurrency(q.deductible)} · valid until {formatDate(q.validUntil)}
                        </span>
                        {q.isIncumbent ? <Badge variant="outline">Incumbent renewal</Badge> : null}
                        {q.isBound ? <Badge>Bound</Badge> : null}
                        {q.expired ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="size-3" aria-hidden="true" />
                            Expired
                          </Badge>
                        ) : null}
                      </span>
                      <span className="flex gap-1">
                        {s.status === "quoted" && !anyBound && !policyHasOutcome ? (
                          <Button type="button" size="sm" disabled={pending || q.expired} title={q.expired ? "Expired quotes cannot be bound" : undefined} onClick={() => bind(q, s.carrier)}>
                            Bind
                          </Button>
                        ) : null}
                        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${s.carrier} quote ${formatCurrency(q.premium)}`} onClick={() => setDialog({ kind: "quote", s, q })}>
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${s.carrier} quote ${formatCurrency(q.premium)}`} disabled={q.isBound} onClick={() => setDialog({ kind: "delete-quote", s, q })}>
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </span>
                      {q.subjectivities ? <span className="w-full text-xs text-muted-foreground">Subjectivities: {q.subjectivities}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {dialog?.kind === "submission" ? <SubmissionDialog slug={slug} policyId={policyId} asOf={asOf} s={dialog.s} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "decline" ? <DeclineDialog slug={slug} asOf={asOf} s={dialog.s} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "quote" ? <QuoteDialog slug={slug} asOf={asOf} s={dialog.s} q={dialog.q} expiring={expiring} onClose={() => setDialog(null)} /> : null}
      <AlertDialog open={dialog?.kind === "delete-submission" || dialog?.kind === "delete-quote"} onOpenChange={(o) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog?.kind === "delete-quote" ? `Delete this ${dialog.s.carrier} quote?` : dialog?.kind === "delete-submission" ? `Remove ${dialog.s.carrier}?` : ""}</AlertDialogTitle>
            <AlertDialogDescription>{dialog?.kind === "delete-submission" ? "The submission and its quotes are removed. This cannot be undone." : "This cannot be undone."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={() => {
                if (dialog?.kind === "delete-quote") run(() => deleteQuote(slug, dialog.q.id), "Quote deleted");
                else if (dialog?.kind === "delete-submission") run(() => deleteSubmission(slug, dialog.s.id), `${dialog.s.carrier} removed`);
              }}
            >
              {pending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function useSave(onClose: () => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function save(fn: () => Promise<{ ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string> }>, setError: (k: string, m: string) => void, success: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.message);
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k, m);
        return;
      }
      toast.success(success);
      onClose();
      router.refresh();
    });
  }
  return { pending, save };
}

function SubmissionDialog({ slug, policyId, asOf, s, onClose }: { slug: string; policyId: string; asOf: string; s: SubmissionView | null; onClose: () => void }) {
  const { pending, save } = useSave(onClose);
  const { register, handleSubmit, formState, getValues, setError } = useForm<SubmissionFormInput, unknown, SubmissionFormValues>({
    resolver: zodResolver(submissionFormSchema(asOf)),
    defaultValues: s ? { carrier: s.carrier, sentOn: s.sentOn ?? "", notes: s.notes ?? "" } : { carrier: "", sentOn: asOf, notes: "" },
    mode: "onChange",
  });
  const msg = (k: keyof SubmissionFormInput) => formState.errors[k]?.message;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          onSubmit={handleSubmit(() =>
            save(
              async () => {
                const raw = getValues();
                const res = s ? await updateSubmission(slug, s.id, raw) : await createSubmission(slug, policyId, raw);
                if (res.ok && s?.status === "planned" && raw.sentOn) return setSubmissionStatus(slug, s.id, "submitted");
                return res;
              },
              (k, m) => setError(k as keyof SubmissionFormInput, { message: m }),
              s ? "Submission saved" : "Carrier added",
            ),
          )}
          noValidate
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{s ? `Edit ${s.carrier}` : "Add carrier"}</DialogTitle>
            <DialogDescription>With a sent date it is recorded as submitted; leave it blank to plan the approach.</DialogDescription>
          </DialogHeader>
          <Field id="sub-carrier" label="Carrier" required error={msg("carrier")}>
            <Input {...register("carrier")} {...fieldA11y("sub-carrier", msg("carrier"))} autoComplete="off" />
          </Field>
          <Field id="sub-sent" label="Sent on" error={msg("sentOn")} hint={`Not after ${formatDate(asOf)}`}>
            <Input type="date" {...register("sentOn")} {...fieldA11y("sub-sent", msg("sentOn"), "hint")} max={asOf} />
          </Field>
          <Field id="sub-notes" label="Notes" error={msg("notes")}>
            <Textarea {...register("notes")} {...fieldA11y("sub-notes", msg("notes"))} rows={2} />
          </Field>
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

function DeclineDialog({ slug, asOf, s, onClose }: { slug: string; asOf: string; s: SubmissionView; onClose: () => void }) {
  const { pending, save } = useSave(onClose);
  const { register, handleSubmit, formState, getValues, setError } = useForm<DeclineFormInput, unknown, DeclineFormValues>({
    resolver: zodResolver(declineFormSchema(asOf)),
    defaultValues: { declinedReason: "" as DeclineReason, respondedOn: asOf, notes: s.notes ?? "" },
    mode: "onChange",
  });
  const msg = (k: keyof DeclineFormInput) => formState.errors[k]?.message;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          onSubmit={handleSubmit(() => save(() => declineSubmission(slug, s.id, getValues()), (k, m) => setError(k as keyof DeclineFormInput, { message: m }), `${s.carrier} recorded as declined`))}
          noValidate
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{s.carrier} declined</DialogTitle>
            <DialogDescription>The reason feeds the market log&apos;s declines by reason.</DialogDescription>
          </DialogHeader>
          <Field id="dec-reason" label="Reason" required error={msg("declinedReason")}>
            <NativeSelect {...register("declinedReason")} {...fieldA11y("dec-reason", msg("declinedReason"))}>
              <option value="">Choose a reason</option>
              {DECLINE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {DECLINE_REASON_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="dec-date" label="Declined on" required error={msg("respondedOn")}>
            <Input type="date" {...register("respondedOn")} {...fieldA11y("dec-date", msg("respondedOn"))} max={asOf} />
          </Field>
          <Field id="dec-notes" label="Notes" error={msg("notes")}>
            <Textarea {...register("notes")} {...fieldA11y("dec-notes", msg("notes"))} rows={2} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formState.isValid || pending}>
              {pending ? "Saving…" : "Record decline"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuoteDialog({ slug, asOf, s, q, expiring, onClose }: { slug: string; asOf: string; s: SubmissionView; q: QuoteView | null; expiring: ExpiringDefaults; onClose: () => void }) {
  const { pending, save } = useSave(onClose);
  const defaults: QuoteFormInput = q
    ? {
        quotedPremium: String(q.premium),
        occurrenceLimit: str(q.occurrenceLimit),
        aggregateLimit: str(q.aggregateLimit),
        deductible: str(q.deductible),
        endorsements: q.endorsements,
        commissionRate: String(q.commissionRate),
        exposureAmount: str(q.exposureAmount),
        subjectivities: q.subjectivities ?? "",
        validUntil: q.validUntil,
        isIncumbentRenewal: q.isIncumbent,
        respondedOn: s.respondedOn ?? asOf,
      }
    : {
        quotedPremium: "",
        occurrenceLimit: str(expiring.occurrenceLimit),
        aggregateLimit: str(expiring.aggregateLimit),
        deductible: str(expiring.deductible),
        endorsements: expiring.endorsements,
        commissionRate: String(expiring.commissionRate),
        exposureAmount: "",
        subjectivities: "",
        validUntil: addDays(asOf, 30).value,
        isIncumbentRenewal: s.carrier === expiring.carrier,
        respondedOn: asOf,
      };
  const { register, handleSubmit, formState, getValues, setError } = useForm<QuoteFormInput, unknown, QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema(asOf)),
    defaultValues: defaults,
    mode: "onChange",
  });
  const msg = (k: keyof QuoteFormInput) => formState.errors[k]?.message;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form
          onSubmit={handleSubmit(() => save(() => saveQuote(slug, s.id, q?.id ?? null, getValues()), (k, m) => setError(k as keyof QuoteFormInput, { message: m }), q ? "Quote saved" : `Quote from ${s.carrier} recorded`))}
          noValidate
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{q ? `Edit ${s.carrier} quote` : `Quote from ${s.carrier}`}</DialogTitle>
            <DialogDescription>Terms start from the expiring policy; change whatever the carrier quoted differently.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="q-premium" label="Quoted premium (CAD)" required error={msg("quotedPremium")}>
              <Input {...register("quotedPremium")} {...fieldA11y("q-premium", msg("quotedPremium"))} inputMode="decimal" />
            </Field>
            <Field id="q-commission" label="Commission rate (%)" required error={msg("commissionRate")}>
              <Input {...register("commissionRate")} {...fieldA11y("q-commission", msg("commissionRate"))} inputMode="decimal" />
            </Field>
            <Field id="q-occ" label="Occurrence limit (CAD)" error={msg("occurrenceLimit")}>
              <Input {...register("occurrenceLimit")} {...fieldA11y("q-occ", msg("occurrenceLimit"))} inputMode="decimal" />
            </Field>
            <Field id="q-agg" label="Aggregate limit (CAD)" error={msg("aggregateLimit")}>
              <Input {...register("aggregateLimit")} {...fieldA11y("q-agg", msg("aggregateLimit"))} inputMode="decimal" />
            </Field>
            <Field id="q-ded" label="Deductible (CAD)" error={msg("deductible")}>
              <Input {...register("deductible")} {...fieldA11y("q-ded", msg("deductible"))} inputMode="decimal" />
            </Field>
            <Field
              id="q-exposure"
              label="Exposure rated on"
              error={msg("exposureAmount")}
              hint={expiring.exposureAmount === null ? "Blank uses the expiring exposure" : `Blank uses the expiring ${expiring.exposureAmount.toLocaleString("en-CA")}`}
            >
              <Input {...register("exposureAmount")} {...fieldA11y("q-exposure", msg("exposureAmount"), "hint")} inputMode="decimal" />
            </Field>
            <Field id="q-valid" label="Valid until" required error={msg("validUntil")} hint="A date before the as-of date is flagged expired">
              <Input type="date" {...register("validUntil")} {...fieldA11y("q-valid", msg("validUntil"), "hint")} />
            </Field>
            <Field id="q-date" label="Quote received on" required error={msg("respondedOn")}>
              <Input type="date" {...register("respondedOn")} {...fieldA11y("q-date", msg("respondedOn"))} max={asOf} />
            </Field>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Endorsements included</legend>
            {ENDORSEMENTS.map((e) => (
              <NativeCheckbox key={e} id={`q-end-${e}`} value={e} label={ENDORSEMENT_LABELS[e]} {...register("endorsements")} />
            ))}
          </fieldset>
          <NativeCheckbox id="q-incumbent" label="Incumbent renewal quote" {...register("isIncumbentRenewal")} />
          <Field id="q-subj" label="Subjectivities" error={msg("subjectivities")}>
            <Textarea {...register("subjectivities")} {...fieldA11y("q-subj", msg("subjectivities"))} rows={2} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formState.isValid || pending}>
              {pending ? "Saving…" : "Save quote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
