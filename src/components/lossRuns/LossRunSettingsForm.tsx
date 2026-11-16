"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeCheckbox } from "@/components/form/Checkbox";
import { lossRunSettingsSchema, type LossRunSettingsInput, type LossRunSettingsValues } from "@/lib/schemas/claim";
import { lossRunsHref, queryFromSettings, type LossRunQuery } from "./params";

interface Props {
  slug: string;
  accountId: string;
  line: string;
  current: LossRunSettingsInput;
  prospectiveYear: number | null;
  /** The Active / Expired expansions in the URL, kept when settings are applied. */
  keep: Pick<LossRunQuery, "active" | "expired">;
  /** The workspace date, formatted, e.g. "16 Nov 2026". */
  asOfLabel: string;
}

const AGES = [
  ["ldf12", "12 months"],
  ["ldf24", "24 months"],
  ["ldf36", "36 months"],
  ["ldf48", "48 months"],
  ["ldf60", "60+ months"],
] as const;

/** Editable analysis settings; Apply writes them to the URL so the view can be shared. */
export function LossRunSettingsForm({ slug, accountId, line, current, prospectiveYear, keep, asOfLabel }: Props) {
  const router = useRouter();
  const { register, handleSubmit, formState, control } = useForm<LossRunSettingsInput, unknown, LossRunSettingsValues>({
    resolver: zodResolver(lossRunSettingsSchema),
    defaultValues: current,
    mode: "onChange",
  });
  const e = formState.errors;
  const trendOn = useWatch({ control, name: "trendOn" });
  const devOn = useWatch({ control, name: "developmentOn" });

  function onSubmit(v: LossRunSettingsValues) {
    router.push(lossRunsHref(slug, accountId, queryFromSettings(v, line, keep)), { scroll: false });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Loss run analysis settings" className="flex flex-col gap-4 rounded-lg border p-4">
      <h2 className="text-base font-semibold">Analysis settings</h2>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Trend</legend>
        <NativeCheckbox id="trend-on" label="Apply loss trend" {...register("trendOn")} />
        <p className="text-xs text-muted-foreground">
          Trend restates older years at today&apos;s cost levels: trended incurred = incurred × (1 + trend) ^ (prospective year − policy year).
          {prospectiveYear ? ` The prospective (renewal) year is ${prospectiveYear}.` : ""}
        </p>
        {trendOn ? (
          <Field id="trend-rate" label="Annual loss trend (%)" required error={e.trend?.message} className="flex max-w-48 flex-col gap-1.5">
            <Input {...register("trend")} {...fieldA11y("trend-rate", e.trend?.message)} inputMode="decimal" />
          </Field>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Development</legend>
        <NativeCheckbox id="dev-on" label="Apply loss development" {...register("developmentOn")} />
        <p className="text-xs text-muted-foreground">
          Development factors come from the insurer or an actuary and are entered here, not calculated. Each policy year uses the factor for its age: whole months from
          its effective date to {asOfLabel}, bucketed down to 12, 24, 36, 48 or 60+ (under 12 uses 12). Developed incurred = incurred × factor.
        </p>
        {devOn ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {AGES.map(([key, label]) => (
              <Field key={key} id={`f-${key}`} label={label} required error={e[key]?.message}>
                <Input {...register(key)} {...fieldA11y(`f-${key}`, e[key]?.message)} inputMode="decimal" />
              </Field>
            ))}
          </div>
        ) : null}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="ll-threshold" label="Large loss threshold (CAD)" required error={e.threshold?.message} hint="Claims at or above this are listed as large losses.">
          <Input {...register("threshold")} {...fieldA11y("ll-threshold", e.threshold?.message, "hint")} inputMode="decimal" />
        </Field>
        <Field id="ll-cap" label="Cap per claim (CAD)" required error={e.cap?.message} hint="Capped incurred counts each claim up to this amount.">
          <Input {...register("cap")} {...fieldA11y("ll-cap", e.cap?.message, "hint")} inputMode="decimal" />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!formState.isValid}>
          Apply settings
        </Button>
        <Button asChild variant="ghost">
          <Link href={lossRunsHref(slug, accountId, { line, trend: "", ldf: "", threshold: "", cap: "", active: keep.active, expired: keep.expired })} scroll={false}>
            Reset to defaults
          </Link>
        </Button>
      </div>
    </form>
  );
}
