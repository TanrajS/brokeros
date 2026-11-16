"use client";

import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeSelect } from "@/components/form/NativeSelect";
import { InfoTip } from "@/components/InfoTip";
import { Missing } from "@/components/Missing";
import { ShowMath } from "@/components/dashboard/ShowMath";
import { COINSURANCE_PERCENTS } from "@/lib/constants";
import { coinsurancePayment } from "@/lib/domain/program";
import { formatCurrency, formatRatioPercent } from "@/lib/format";
import { adequacyFormSchema, type AdequacyFormInput, type AdequacyFormValues } from "@/lib/schemas/program";

interface Props {
  defaults: { insurableValue: number | null; coinsurancePercent: number | null; carriedLimit: number | null; deductible: number | null };
}

const str = (n: number | null) => (n === null ? "" : String(n));

/** Coinsurance adequacy for a Property policy. Everything recomputes as the inputs change; nothing is saved. */
export function AdequacyPanel({ defaults }: Props) {
  const { register, formState, control } = useForm<AdequacyFormInput, unknown, AdequacyFormValues>({
    resolver: zodResolver(adequacyFormSchema),
    defaultValues: {
      insurableValue: str(defaults.insurableValue),
      coinsurancePercent: defaults.coinsurancePercent === null ? "80" : String(defaults.coinsurancePercent),
      carriedLimit: str(defaults.carriedLimit),
      loss: "100,000",
      deductible: str(defaults.deductible ?? 0),
    },
    mode: "onChange",
  });
  const msg = (k: keyof AdequacyFormInput) => formState.errors[k]?.message;
  const raw = useWatch({ control });
  const result = useMemo(() => {
    const parsed = adequacyFormSchema.safeParse(raw);
    return parsed.success ? coinsurancePayment(parsed.data) : null;
  }, [raw]);
  const r = result?.value ?? null;

  return (
    <section aria-labelledby="adequacy-heading" className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 id="adequacy-heading" className="flex items-center gap-1.5 text-lg font-semibold">
        Adequacy (coinsurance)
        <InfoTip label="About the adequacy check">
          Required limit = insurable value × coinsurance clause. Below it, a loss is paid in the proportion carried ÷ required, less the deductible, up to the limit carried. This shows the arithmetic;
          whether the limit is adequate is your call with the client.
        </InfoTip>
      </h2>
      <form noValidate className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Adequacy inputs">
        <Field id="adq-value" label="Insurable value (CAD)" required error={msg("insurableValue")}>
          <Input {...register("insurableValue")} {...fieldA11y("adq-value", msg("insurableValue"))} inputMode="decimal" />
        </Field>
        <Field id="adq-coins" label="Coinsurance" required error={msg("coinsurancePercent")}>
          <NativeSelect {...register("coinsurancePercent")} {...fieldA11y("adq-coins", msg("coinsurancePercent"))}>
            {COINSURANCE_PERCENTS.map((c) => (
              <option key={c} value={String(c)}>
                {c}%
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="adq-carried" label="Limit carried (CAD)" required error={msg("carriedLimit")} hint="Defaults to the policy's occurrence limit">
          <Input {...register("carriedLimit")} {...fieldA11y("adq-carried", msg("carriedLimit"), "hint")} inputMode="decimal" />
        </Field>
        <Field id="adq-loss" label="Hypothetical loss (CAD)" required error={msg("loss")}>
          <Input {...register("loss")} {...fieldA11y("adq-loss", msg("loss"))} inputMode="decimal" />
        </Field>
        <Field id="adq-ded" label="Deductible (CAD)" required error={msg("deductible")} hint="Defaults to the policy's">
          <Input {...register("deductible")} {...fieldA11y("adq-ded", msg("deductible"), "hint")} inputMode="decimal" />
        </Field>
      </form>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
        <Stat label="Required limit" value={r ? formatCurrency(r.requiredLimit) : null} missing="Required limit (fix the inputs)" detail={r ? (r.underinsured ? `Carried limit is ${formatCurrency(r.additionalLimitNeeded)} short` : "Carried limit meets the clause") : ""} />
        <Stat label="Insurer pays" value={r ? formatCurrency(r.payment) : null} missing="Payment (fix the inputs)" detail={r ? (r.underinsured ? `Penalty share ${formatRatioPercent(r.penaltyShare)}` : "No coinsurance penalty") : ""} />
        <Stat label="Client absorbs" value={r ? formatCurrency(r.clientAbsorbs) : null} missing="Client share (fix the inputs)" detail="Loss − payment" />
        <Stat label="Additional limit to satisfy coinsurance" value={r ? formatCurrency(r.additionalLimitNeeded) : null} missing="Additional limit (fix the inputs)" detail="Required − carried, floor zero" />
      </dl>
      {result ? <ShowMath lines={result.math.steps.lines as string[]} /> : null}
    </section>
  );
}

function Stat({ label, value, missing, detail }: { label: string; value: string | null; missing: string; detail: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value === null ? <Missing what={missing} /> : value}</dd>
      {detail ? <dd className="text-xs text-muted-foreground">{detail}</dd> : null}
    </div>
  );
}
