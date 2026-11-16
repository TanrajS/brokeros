"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
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
import { InfoTip } from "@/components/InfoTip";
import { formatCurrency } from "@/lib/format";
import { quoteOptionFormSchema, type QuoteOptionFormInput, type QuoteOptionFormValues } from "@/lib/schemas/strategy";
import { deleteQuoteOption, saveQuoteOption } from "@/server/strategy/actions";

export interface OptionRow {
  id: string;
  label: string;
  carrier: string;
  deductible: number;
  aggregateCap: number | null;
  premium: number;
}

interface Props {
  slug: string;
  policyId: string;
  expiringCarrier: string;
  rows: OptionRow[];
}

type Dialogs = { kind: "edit"; o: OptionRow | null } | { kind: "delete"; o: OptionRow } | null;
const str = (n: number | null) => (n === null ? "" : String(n));
const money = (n: number | null | undefined) => formatCurrency(n) ?? "—";

/** The retention options entered by hand: a deductible (or self-insured retention) and its annual premium. */
export function OptionsSection({ slug, policyId, expiringCarrier, rows }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<Dialogs>(null);

  function remove(o: OptionRow) {
    startTransition(async () => {
      const res = await deleteQuoteOption(slug, o.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`${o.label} removed`);
      setDialog(null);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="options-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="options-heading" className="flex items-center gap-1.5 text-lg font-semibold">
          Retention options entered by hand
          <InfoTip label="About manual options">
            A deductible (or self-insured retention) with the annual premium entered by hand. Manual options override the estimated ones at the same deductible. An aggregate cap limits what the client
            retains in a year.
          </InfoTip>
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setDialog({ kind: "edit", o: null })}>
            <Plus aria-hidden="true" />
            Add option
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">No options entered by hand yet. The estimated options below come from the loss history; add one here to override an estimate.</p>
      ) : (
        <div className="relative overflow-x-auto rounded-lg border">
          <Table>
            <caption className="sr-only">Retention options for this policy</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Option</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead className="text-right">Deductible ($ per claim)</TableHead>
                <TableHead className="text-right">Aggregate cap ($ per year)</TableHead>
                <TableHead className="text-right">Premium ($ per year, entered by hand)</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.label}</TableCell>
                  <TableCell>{o.carrier}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(o.deductible)}</TableCell>
                  <TableCell className="text-right tabular-nums">{o.aggregateCap === null ? <span className="text-muted-foreground">No cap</span> : money(o.aggregateCap)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(o.premium)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${o.label}`} onClick={() => setDialog({ kind: "edit", o })}>
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${o.label}`} onClick={() => setDialog({ kind: "delete", o })}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {dialog?.kind === "edit" ? <OptionDialog slug={slug} policyId={policyId} expiringCarrier={expiringCarrier} o={dialog.o} onClose={() => setDialog(null)} /> : null}
      <AlertDialog open={dialog?.kind === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog?.kind === "delete" ? `Delete ${dialog.o.label}?` : ""}</AlertDialogTitle>
            <AlertDialogDescription>The option leaves the comparison and the report. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={() => dialog?.kind === "delete" && remove(dialog.o)}>
              {pending ? "Removing…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function OptionDialog({ slug, policyId, expiringCarrier, o, onClose }: { slug: string; policyId: string; expiringCarrier: string; o: OptionRow | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, formState, getValues, setError, control, trigger } = useForm<QuoteOptionFormInput, unknown, QuoteOptionFormValues>({
    resolver: zodResolver(quoteOptionFormSchema),
    defaultValues: o
      ? { label: o.label, carrier: o.carrier, deductible: str(o.deductible), aggregateCap: str(o.aggregateCap), premium: str(o.premium) }
      : { label: "", carrier: expiringCarrier, deductible: "", aggregateCap: "", premium: "" },
    mode: "onChange",
  });
  const msg = (k: keyof QuoteOptionFormInput) => formState.errors[k]?.message;
  // The cap rule depends on the deductible, so re-check the cap whenever the other amounts change.
  const [deductible, premium] = useWatch({ control, name: ["deductible", "premium"] });
  useEffect(() => {
    if (getValues("aggregateCap")) void trigger("aggregateCap");
  }, [deductible, premium, getValues, trigger]);

  function onSubmit() {
    startTransition(async () => {
      const res = await saveQuoteOption(slug, policyId, o?.id ?? null, getValues());
      if (!res.ok) {
        toast.error(res.message);
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k as keyof QuoteOptionFormInput, { message: m });
        return;
      }
      toast.success(o ? "Option saved" : "Option added");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{o ? `Edit ${o.label}` : "Add retention option"}</DialogTitle>
            <DialogDescription>A deductible or self-insured retention with the annual premium entered for it; it is not a bound quote. Amounts in dollars.</DialogDescription>
          </DialogHeader>
          <Field id="opt-label" label="Label" required error={msg("label")} hint="For example: $25,000 deductible">
            <Input {...register("label")} {...fieldA11y("opt-label", msg("label"), "hint")} autoComplete="off" />
          </Field>
          <Field id="opt-carrier" label="Carrier" required error={msg("carrier")}>
            <Input {...register("carrier")} {...fieldA11y("opt-carrier", msg("carrier"))} autoComplete="off" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field id="opt-ded" label="Deductible ($ per claim)" required error={msg("deductible")}>
              <Input {...register("deductible")} {...fieldA11y("opt-ded", msg("deductible"))} inputMode="decimal" />
            </Field>
            <Field id="opt-cap" label="Aggregate cap ($ per year)" error={msg("aggregateCap")} hint="Blank = no cap">
              <Input {...register("aggregateCap")} {...fieldA11y("opt-cap", msg("aggregateCap"), "hint")} inputMode="decimal" />
            </Field>
            <Field id="opt-premium" label="Premium ($ per year)" required error={msg("premium")}>
              <Input {...register("premium")} {...fieldA11y("opt-premium", msg("premium"))} inputMode="decimal" />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formState.isValid || pending}>
              {pending ? "Saving…" : "Save option"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
