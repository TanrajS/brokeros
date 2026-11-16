"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, fieldA11y } from "@/components/form/Field";
import { formatCurrency } from "@/lib/format";
import { toleranceFormSchema, type ToleranceFormInput, type ToleranceFormValues } from "@/lib/schemas/strategy";
import { saveToleranceSettings } from "@/server/strategy/actions";

interface Props {
  slug: string;
  accountId: string;
  current: { toleranceOccurrence: number | null; toleranceYear: number | null; permissibleLossRatio: number };
  defaults: { perOccurrence: number | null; perYear: number | null };
  revenue: number | null;
}

/** Risk tolerance per occurrence and per policy year, and the permissible loss ratio behind the estimated premiums. Blank = the default from revenue. */
export function ToleranceForm({ slug, accountId, current, defaults, revenue }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, formState, getValues, setError } = useForm<ToleranceFormInput, unknown, ToleranceFormValues>({
    resolver: zodResolver(toleranceFormSchema),
    defaultValues: { toleranceOccurrence: current.toleranceOccurrence === null ? "" : String(current.toleranceOccurrence), toleranceYear: current.toleranceYear === null ? "" : String(current.toleranceYear), permissibleLossRatio: current.permissibleLossRatio.toFixed(2) },
    mode: "onChange",
  });
  const msg = (k: keyof ToleranceFormInput) => formState.errors[k]?.message;
  const dflt = (n: number | null) => (n === null ? "no default without annual revenue" : `default ${formatCurrency(n)}`);

  function onSubmit() {
    startTransition(async () => {
      const res = await saveToleranceSettings(slug, accountId, getValues());
      if (!res.ok) {
        toast.error(res.message);
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k as keyof ToleranceFormInput, { message: m });
        return;
      }
      toast.success("Risk tolerance saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate aria-labelledby="tolerance-heading" className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 id="tolerance-heading" className="text-sm font-semibold">
        Risk tolerance and pricing assumptions
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="tol-occ" label="Tolerance per occurrence (CAD)" error={msg("toleranceOccurrence")} hint={`0.5% of revenue: ${dflt(defaults.perOccurrence)}`}>
          <Input {...register("toleranceOccurrence")} {...fieldA11y("tol-occ", msg("toleranceOccurrence"), "hint")} inputMode="decimal" placeholder={defaults.perOccurrence === null ? "" : String(defaults.perOccurrence)} />
        </Field>
        <Field id="tol-year" label="Tolerance per policy year (CAD)" error={msg("toleranceYear")} hint={`1% of revenue: ${dflt(defaults.perYear)}`}>
          <Input {...register("toleranceYear")} {...fieldA11y("tol-year", msg("toleranceYear"), "hint")} inputMode="decimal" placeholder={defaults.perYear === null ? "" : String(defaults.perYear)} />
        </Field>
        <Field id="tol-plr" label="Permissible loss ratio" required error={msg("permissibleLossRatio")} hint="default 0.65">
          <Input {...register("permissibleLossRatio")} {...fieldA11y("tol-plr", msg("permissibleLossRatio"), "hint")} inputMode="decimal" />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Estimated premiums are derived from your loss history and this ratio; they are not quotes.
        {revenue === null ? " Enter annual revenue on the account, or tolerances here, to run the findings." : ""}
      </p>
      <div>
        <Button type="submit" size="sm" disabled={!formState.isValid || pending || !formState.isDirty}>
          {pending ? "Saving…" : "Save tolerances"}
        </Button>
      </div>
    </form>
  );
}
