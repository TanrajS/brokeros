"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, fieldA11y } from "@/components/form/Field";
import { forecastAssumptionsSchema, type ForecastAssumptionsInput, type ForecastAssumptionsValues } from "@/lib/schemas/dashboard";
import { dashboardHref, type DashboardQuery } from "./params";

interface Props {
  slug: string;
  query: DashboardQuery;
  /** The values currently applied, as percent strings. */
  current: { retention: string; rateChange: string };
  retentionHint: string;
  isDefault: boolean;
}

/** Editable forecast assumptions. Applying writes them to the URL so the forecast can be shared. */
export function ForecastAssumptionsForm({ slug, query, current, retentionHint, isDefault }: Props) {
  const router = useRouter();
  const { register, handleSubmit, formState } = useForm<ForecastAssumptionsInput, unknown, ForecastAssumptionsValues>({
    resolver: zodResolver(forecastAssumptionsSchema),
    defaultValues: current,
    mode: "onChange",
  });
  const err = formState.errors;

  function onSubmit(v: ForecastAssumptionsValues) {
    router.push(dashboardHref(slug, query, { retention: String(v.retention), rate: String(v.rateChange) }), { scroll: false });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3" aria-label="Forecast assumptions">
      <Field id="assumed-retention" label="Assumed retention (%)" required error={err.retention?.message} hint={retentionHint}>
        <Input {...register("retention")} {...fieldA11y("assumed-retention", err.retention?.message, retentionHint)} inputMode="decimal" />
      </Field>
      <Field id="assumed-rate" label="Assumed rate change (%)" required error={err.rateChange?.message} hint="Default 0. Use a minus sign for a decrease.">
        <Input {...register("rateChange")} {...fieldA11y("assumed-rate", err.rateChange?.message, "hint")} inputMode="decimal" />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!formState.isValid}>
          Apply assumptions
        </Button>
        {!isDefault ? (
          <Button asChild variant="ghost">
            <Link href={dashboardHref(slug, query, { retention: "", rate: "" })} scroll={false}>
              Reset to defaults
            </Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
