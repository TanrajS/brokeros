"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeCheckbox } from "@/components/form/Checkbox";
import { strategySettingsSchema, type StrategySettingsInput, type StrategySettingsValues } from "@/lib/schemas/strategy";
import { EMPTY_STRATEGY_QUERY, queryFromSettings, strategyHref } from "./params";

interface Props {
  slug: string;
  accountId: string;
  policyId: string;
  current: StrategySettingsInput;
  prospectiveYear: number | null;
  /** Label of the current (incomplete) year, when there is one, e.g. "PY2026". */
  runningYear: string | null;
  availableYears: number;
}

const AGES = [
  ["ldf12", "12 months"],
  ["ldf24", "24 months"],
  ["ldf36", "36 months"],
  ["ldf48", "48 months"],
  ["ldf60", "60+ months"],
] as const;

/** Years, current-year toggle and the v0.4 adjustments. Apply writes them to the URL so the view and the report share them. */
export function StrategySettingsForm({ slug, accountId, policyId, current, prospectiveYear, runningYear, availableYears }: Props) {
  const router = useRouter();
  const { register, handleSubmit, formState, control } = useForm<StrategySettingsInput, unknown, StrategySettingsValues>({
    resolver: zodResolver(strategySettingsSchema),
    defaultValues: current,
    mode: "onChange",
  });
  const e = formState.errors;
  const trendOn = useWatch({ control, name: "trendOn" });
  const devOn = useWatch({ control, name: "developmentOn" });

  function onSubmit(v: StrategySettingsValues) {
    router.push(strategyHref(slug, accountId, queryFromSettings(v, policyId)), { scroll: false });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate aria-labelledby="settings-heading" className="flex flex-col gap-4 rounded-lg border p-4">
      <h2 id="settings-heading" className="text-base font-semibold">
        Analysis settings
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="st-years" label="Policy years to use" required error={e.years?.message} hint={`Most recent first; ${availableYears} ${availableYears === 1 ? "year has" : "years have"} started so far.`}>
          <Input {...register("years")} {...fieldA11y("st-years", e.years?.message, "hint")} inputMode="numeric" className="max-w-32" />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Current year</legend>
          <NativeCheckbox id="st-current" label={runningYear ? `Include the current year (${runningYear}, incomplete)` : "Include the current year"} {...register("includeCurrent")} disabled={!runningYear} />
          <p className="text-xs text-muted-foreground">
            {runningYear ? "The current year's claims are still arriving; when included, it counts as a full year." : "No policy year is running at the workspace date."}
          </p>
        </fieldset>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Trend</legend>
        <NativeCheckbox id="st-trend-on" label="Apply loss trend" {...register("trendOn")} />
        <p className="text-xs text-muted-foreground">
          Each claim is restated before the deductible applies: trended incurred = incurred × (1 + trend) ^ (prospective year − policy year).
          {prospectiveYear ? ` The prospective (renewal) year is ${prospectiveYear}.` : ""}
        </p>
        {trendOn ? (
          <Field id="st-trend" label="Annual loss trend (%)" required error={e.trend?.message} className="flex max-w-48 flex-col gap-1.5">
            <Input {...register("trend")} {...fieldA11y("st-trend", e.trend?.message)} inputMode="decimal" />
          </Field>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Development</legend>
        <NativeCheckbox id="st-dev-on" label="Apply loss development" {...register("developmentOn")} />
        <p className="text-xs text-muted-foreground">
          Factors are entered, not calculated. Each policy year uses the factor for its age (whole months from its effective date to the workspace date, bucketed down to 12, 24, 36, 48 or 60+).
          Developed incurred = incurred × factor, per claim.
        </p>
        {devOn ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {AGES.map(([key, label]) => (
              <Field key={key} id={`st-${key}`} label={label} required error={e[key]?.message}>
                <Input {...register(key)} {...fieldA11y(`st-${key}`, e[key]?.message)} inputMode="decimal" />
              </Field>
            ))}
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!formState.isValid}>
          Apply settings
        </Button>
        <Button asChild variant="ghost">
          <Link href={strategyHref(slug, accountId, { ...EMPTY_STRATEGY_QUERY, policy: policyId })} scroll={false}>
            Reset to defaults
          </Link>
        </Button>
      </div>
    </form>
  );
}
