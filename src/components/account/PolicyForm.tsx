"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeSelect } from "@/components/form/NativeSelect";
import { NativeCheckbox } from "@/components/form/Checkbox";
import {
  ENDORSEMENTS,
  ENDORSEMENT_LABELS,
  EXPOSURE_BASES,
  EXPOSURE_BASIS_LABELS,
  LINES_OF_BUSINESS,
  RENEWAL_STATUSES,
  RENEWAL_STATUS_LABELS,
} from "@/lib/constants";
import { commissionAmount, parseCurrencyInput } from "@/lib/domain/money";
import { formatCurrency, formatDate } from "@/lib/format";
import { policyFormSchema, type PolicyFormInput, type PolicyFormValues } from "@/lib/schemas/policy";
import { createPolicy, updatePolicy } from "@/server/policies/actions";

export interface PreviousPolicyOption {
  id: string;
  label: string;
}

interface Props {
  slug: string;
  accountId: string;
  policyId?: string;
  defaultValues: PolicyFormInput;
  previousOptions: PreviousPolicyOption[];
  cancelHref: string;
}

export function PolicyForm({ slug, accountId, policyId, defaultValues, previousOptions, cancelHref }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<PolicyFormInput, unknown, PolicyFormValues>({
    resolver: zodResolver(policyFormSchema),
    defaultValues,
    mode: "onChange",
  });
  const { register, handleSubmit, formState, getValues, setError, control } = form;
  const errors = formState.errors;
  const msg = (k: keyof PolicyFormInput) => errors[k]?.message;

  // Live commission preview, computed with the same domain function the tables use.
  const premiumRaw = useWatch({ control, name: "annualPremium" });
  const rateRaw = useWatch({ control, name: "commissionRate" });
  const premium = parseCurrencyInput(premiumRaw ?? "").value;
  const rate = Number(rateRaw);
  const preview =
    premium !== null && rateRaw !== "" && Number.isFinite(rate) && rate >= 0 && rate <= 100 ? commissionAmount(premium, rate) : null;

  const effective = useWatch({ control, name: "effectiveDate" });
  const expiry = useWatch({ control, name: "expiryDate" });

  function onSubmit() {
    const raw = getValues();
    startTransition(async () => {
      const res = policyId ? await updatePolicy(slug, policyId, raw) : await createPolicy(slug, accountId, raw);
      if (!res.ok) {
        toast.error(res.message);
        for (const [field, message] of Object.entries(res.fieldErrors ?? {})) setError(field as keyof PolicyFormInput, { message });
        return;
      }
      toast.success(policyId ? "Policy saved" : "Policy added");
      router.push(`/w/${slug}/accounts/${accountId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-3xl flex-col gap-6">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-base font-semibold">Coverage</legend>
        <Field id="carrier" label="Carrier" required error={msg("carrier")}>
          <Input {...register("carrier")} {...fieldA11y("carrier", msg("carrier"))} autoComplete="off" />
        </Field>
        <Field id="lineOfBusiness" label="Line of business" required error={msg("lineOfBusiness")}>
          <NativeSelect {...register("lineOfBusiness")} {...fieldA11y("lineOfBusiness", msg("lineOfBusiness"))}>
            {LINES_OF_BUSINESS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="policyNumber" label="Policy number" error={msg("policyNumber")}>
          <Input {...register("policyNumber")} {...fieldA11y("policyNumber", msg("policyNumber"))} autoComplete="off" />
        </Field>
        <Field id="renewalStatus" label="Renewal status" required error={msg("renewalStatus")}>
          <NativeSelect {...register("renewalStatus")} {...fieldA11y("renewalStatus", msg("renewalStatus"))}>
            {RENEWAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {RENEWAL_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="effectiveDate" label="Effective date" required error={msg("effectiveDate")}>
          <Input type="date" {...register("effectiveDate")} {...fieldA11y("effectiveDate", msg("effectiveDate"))} />
        </Field>
        <Field
          id="expiryDate"
          label="Expiry date"
          required
          error={msg("expiryDate")}
          hint={effective && expiry && !msg("expiryDate") ? `${formatDate(effective)} → ${formatDate(expiry)}` : undefined}
        >
          <Input type="date" {...register("expiryDate")} {...fieldA11y("expiryDate", msg("expiryDate"))} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-base font-semibold">Limits and money</legend>
        <Field id="occurrenceLimit" label="Occurrence limit (CAD)" error={msg("occurrenceLimit")} hint="e.g. 1,000,000">
          <Input {...register("occurrenceLimit")} {...fieldA11y("occurrenceLimit", msg("occurrenceLimit"), "e.g. 1,000,000")} inputMode="decimal" />
        </Field>
        <Field id="aggregateLimit" label="Aggregate limit (CAD)" error={msg("aggregateLimit")} hint="e.g. 2,000,000">
          <Input {...register("aggregateLimit")} {...fieldA11y("aggregateLimit", msg("aggregateLimit"), "e.g. 2,000,000")} inputMode="decimal" />
        </Field>
        <Field id="deductible" label="Deductible (CAD)" error={msg("deductible")}>
          <Input {...register("deductible")} {...fieldA11y("deductible", msg("deductible"))} inputMode="decimal" />
        </Field>
        <Field id="annualPremium" label="Annual premium (CAD)" required error={msg("annualPremium")} hint="Accepts 48,000 or 48000">
          <Input {...register("annualPremium")} {...fieldA11y("annualPremium", msg("annualPremium"), "Accepts 48,000 or 48000")} inputMode="decimal" />
        </Field>
        <Field
          id="commissionRate"
          label="Commission rate (%)"
          required
          error={msg("commissionRate")}
          hint={preview ? `Commission: ${formatCurrency(preview.value, { cents: true })}` : "0 to 100, e.g. 12.5"}
        >
          <Input {...register("commissionRate")} {...fieldA11y("commissionRate", msg("commissionRate"), "0 to 100")} inputMode="decimal" />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-base font-semibold">Exposure</legend>
        <Field id="exposureBasis" label="Exposure basis" required error={msg("exposureBasis")}>
          <NativeSelect {...register("exposureBasis")} {...fieldA11y("exposureBasis", msg("exposureBasis"))}>
            {EXPOSURE_BASES.map((b) => (
              <option key={b} value={b}>
                {EXPOSURE_BASIS_LABELS[b]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="exposureAmount" label="Exposure amount" error={msg("exposureAmount")} hint="Dollars, vehicles, square feet or employees, depending on the basis">
          <Input {...register("exposureAmount")} {...fieldA11y("exposureAmount", msg("exposureAmount"))} inputMode="decimal" />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-3 text-base font-semibold">Endorsements</legend>
        {ENDORSEMENTS.map((e) => (
          <NativeCheckbox key={e} id={`endorsement-${e}`} value={e} label={ENDORSEMENT_LABELS[e]} {...register("endorsements")} />
        ))}
        {msg("endorsements") ? (
          <p className="text-xs text-destructive" role="alert">
            {msg("endorsements")}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-base font-semibold">History and notes</legend>
        <Field id="previousPolicyId" label="Previous policy" error={msg("previousPolicyId")} hint="The policy this one renewed, if any">
          <NativeSelect {...register("previousPolicyId")} {...fieldA11y("previousPolicyId", msg("previousPolicyId"))}>
            <option value="">None</option>
            {previousOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="notes" label="Notes" error={msg("notes")} className="flex flex-col gap-1.5 sm:col-span-2">
          <Textarea {...register("notes")} {...fieldA11y("notes", msg("notes"))} rows={4} />
        </Field>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!formState.isValid || pending}>
          {pending ? "Saving…" : policyId ? "Save changes" : "Add policy"}
        </Button>
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
