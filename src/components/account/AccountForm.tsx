"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeSelect } from "@/components/form/NativeSelect";
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS, INDUSTRIES, PROVINCES } from "@/lib/constants";
import { titleCase } from "@/lib/format";
import { accountFormSchema, type AccountFormInput, type AccountFormValues } from "@/lib/schemas/account";
import { checkAccountName, createAccount, updateAccount } from "@/server/accounts/actions";

interface Props {
  slug: string;
  accountId?: string;
  defaultValues: AccountFormInput;
  cancelHref: string;
}

export function AccountForm({ slug, accountId, defaultValues, cancelHref }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<AccountFormInput, unknown, AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues,
    mode: "onChange",
  });
  const { register, handleSubmit, formState, getValues, setError, clearErrors } = form;
  const errors = formState.errors;

  function onSubmit() {
    const raw = getValues();
    startTransition(async () => {
      const res = accountId ? await updateAccount(slug, accountId, raw) : await createAccount(slug, raw);
      if (!res.ok) {
        toast.error(res.message);
        for (const [field, message] of Object.entries(res.fieldErrors ?? {})) {
          setError(field as keyof AccountFormInput, { message });
        }
        return;
      }
      toast.success(accountId ? "Account saved" : "Account created");
      const id = accountId ?? (res.data as { id: string }).id;
      router.push(`/w/${slug}/accounts/${id}`);
      router.refresh();
    });
  }

  const msg = (k: keyof AccountFormInput) => errors[k]?.message;
  // v1.5.1: names are unique per workspace; checked on blur so the message shows before Save.
  const [nameTaken, setNameTaken] = useState<string | null>(null);
  function onNameBlur(e: React.FocusEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (!value.trim()) return;
    void checkAccountName(slug, value, accountId ?? null).then((res) => {
      if (!res.ok) return;
      setNameTaken(res.data.error);
      if (res.data.error) setError("name", { type: "duplicate", message: res.data.error });
      else if (errors.name?.type === "duplicate") clearErrors("name");
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-2xl flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="name" label="Account name" required error={msg("name")} className="flex flex-col gap-1.5 sm:col-span-2">
          <Input {...register("name", { onBlur: onNameBlur, onChange: () => nameTaken && setNameTaken(null) })} {...fieldA11y("name", msg("name"))} autoComplete="organization" />
        </Field>
        <Field id="industry" label="Industry" required error={msg("industry")}>
          <NativeSelect {...register("industry")} {...fieldA11y("industry", msg("industry"))}>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {titleCase(i)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="province" label="Province" required error={msg("province")}>
          <NativeSelect {...register("province")} {...fieldA11y("province", msg("province"))}>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="annualRevenue" label="Annual revenue (CAD)" error={msg("annualRevenue")} hint="e.g. 23,000,000">
          <Input {...register("annualRevenue")} {...fieldA11y("annualRevenue", msg("annualRevenue"), "e.g. 23,000,000")} inputMode="decimal" />
        </Field>
        <Field id="employeeCount" label="Employees" error={msg("employeeCount")}>
          <Input {...register("employeeCount")} {...fieldA11y("employeeCount", msg("employeeCount"))} inputMode="numeric" />
        </Field>
        <Field id="producer" label="Producer" error={msg("producer")}>
          <Input {...register("producer")} {...fieldA11y("producer", msg("producer"))} />
        </Field>
        <Field id="accountManager" label="Account manager" error={msg("accountManager")}>
          <Input {...register("accountManager")} {...fieldA11y("accountManager", msg("accountManager"))} />
        </Field>
        <Field id="status" label="Status" required error={msg("status")}>
          <NativeSelect {...register("status")} {...fieldA11y("status", msg("status"))}>
            {ACCOUNT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ACCOUNT_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="notes" label="Notes" error={msg("notes")} className="flex flex-col gap-1.5 sm:col-span-2">
          <Textarea {...register("notes")} {...fieldA11y("notes", msg("notes"))} rows={4} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!formState.isValid || pending}>
          {pending ? "Saving…" : accountId ? "Save changes" : "Create account"}
        </Button>
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
