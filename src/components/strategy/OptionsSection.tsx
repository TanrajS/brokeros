"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
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
import { NativeCheckbox } from "@/components/form/Checkbox";
import { Missing } from "@/components/Missing";
import { formatCurrency } from "@/lib/format";
import { quoteOptionFormSchema, type QuoteOptionFormInput, type QuoteOptionFormValues } from "@/lib/schemas/strategy";
import { deleteQuoteOption, importQuoteOptions, saveQuoteOption } from "@/server/strategy/actions";

export interface OptionRow {
  id: string;
  label: string;
  carrier: string;
  deductible: number;
  aggregateCap: number | null;
  premium: number;
  /** Carrier and premium of the quote this option was imported from, or null when entered by hand. */
  source: string | null;
}

export interface ImportableRow {
  id: string;
  carrier: string;
  premium: number;
  deductible: number | null;
  expired: boolean;
  alreadyImported: boolean;
}

interface Props {
  slug: string;
  policyId: string;
  expiringCarrier: string;
  rows: OptionRow[];
  importable: ImportableRow[];
}

type Dialogs = { kind: "edit"; o: OptionRow | null } | { kind: "import" } | { kind: "delete"; o: OptionRow } | null;
const str = (n: number | null) => (n === null ? "" : String(n));
const money = (n: number | null | undefined) => formatCurrency(n) ?? "—";

/** The retention options table: a deductible (or SIR) and its annual premium, by hand or imported from Marketing quotes. */
export function OptionsSection({ slug, policyId, expiringCarrier, rows, importable }: Props) {
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
        <h2 id="options-heading" className="text-lg font-semibold">
          Retention options
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ kind: "import" })} disabled={importable.length === 0} title={importable.length === 0 ? "No quotes recorded in Marketing for this policy" : undefined}>
            <Download aria-hidden="true" />
            Import from quotes
          </Button>
          <Button type="button" size="sm" onClick={() => setDialog({ kind: "edit", o: null })}>
            <Plus aria-hidden="true" />
            Add option
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Each option is a deductible (or self-insured retention) with its annual premium. An aggregate cap limits what the client retains in a year.</p>
      {rows.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">No options yet. Add the quoted deductibles, or import them from the quotes recorded in Marketing.</p>
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
                <TableHead className="text-right">Premium ($ per year)</TableHead>
                <TableHead>Source</TableHead>
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
                  <TableCell className="text-xs">{o.source ? <Badge variant="outline">Quote: {o.source}</Badge> : <span className="text-muted-foreground">Entered by hand</span>}</TableCell>
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
      {dialog?.kind === "import" ? <ImportDialog slug={slug} policyId={policyId} importable={importable} onClose={() => setDialog(null)} /> : null}
      <AlertDialog open={dialog?.kind === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog?.kind === "delete" ? `Delete ${dialog.o.label}?` : ""}</AlertDialogTitle>
            <AlertDialogDescription>The option leaves the comparison and the report. The quote it came from, if any, is untouched.</AlertDialogDescription>
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
            <DialogDescription>A deductible or self-insured retention with the annual premium quoted for it. Amounts in dollars.</DialogDescription>
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
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ slug, policyId, importable, onClose }: { slug: string; policyId: string; importable: ImportableRow[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const selectable = importable.filter((q) => !q.alreadyImported && q.deductible !== null);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(selectable.map((q) => q.id)));

  function toggle(id: string, on: boolean) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await importQuoteOptions(slug, policyId, [...chosen]);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`${res.data.imported} option${res.data.imported === 1 ? "" : "s"} imported`, { description: res.data.skipped.length ? `Skipped: ${res.data.skipped.join("; ")}` : undefined });
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Import quotes as retention options</DialogTitle>
            <DialogDescription>Each quote becomes an option with its deductible and premium, linked back to the quote for the report&apos;s audit trail.</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {importable.map((q) => {
              const disabled = q.alreadyImported || q.deductible === null;
              return (
                <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                  <NativeCheckbox
                    id={`imp-${q.id}`}
                    label={`${q.carrier}: ${money(q.premium)} premium, ${q.deductible === null ? "no deductible" : `${money(q.deductible)} deductible`}`}
                    checked={chosen.has(q.id)}
                    disabled={disabled}
                    onChange={(e) => toggle(q.id, e.target.checked)}
                  />
                  <span className="flex gap-1">
                    {q.alreadyImported ? <Badge variant="outline">Already imported</Badge> : null}
                    {q.deductible === null ? <Badge variant="secondary">No deductible</Badge> : null}
                    {q.expired ? <Badge variant="destructive">Expired</Badge> : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {importable.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <Missing what="Quotes for this policy" /> No quotes are recorded in Marketing yet.
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || chosen.size === 0}>
              {pending ? "Importing…" : `Import ${chosen.size} quote${chosen.size === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
