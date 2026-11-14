"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, fieldA11y } from "@/components/form/Field";
import { tcorFeesFormSchema, type TcorFeesFormInput, type TcorFeesFormValues } from "@/lib/schemas/strategy";
import { saveTcorFees } from "@/server/strategy/actions";

interface Props {
  slug: string;
  accountId: string;
  current: { brokerFees: number; riskControlSpend: number; claimsAdminCost: number };
}

/** The account's own cost-of-risk inputs; blank means zero. Saved on the account, so every option's TCOR shares them. */
export function TcorFeesForm({ slug, accountId, current }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, formState, getValues, setError } = useForm<TcorFeesFormInput, unknown, TcorFeesFormValues>({
    resolver: zodResolver(tcorFeesFormSchema),
    defaultValues: { brokerFees: String(current.brokerFees), riskControlSpend: String(current.riskControlSpend), claimsAdminCost: String(current.claimsAdminCost) },
    mode: "onChange",
  });
  const msg = (k: keyof TcorFeesFormInput) => formState.errors[k]?.message;

  function onSubmit() {
    startTransition(async () => {
      const res = await saveTcorFees(slug, accountId, getValues());
      if (!res.ok) {
        toast.error(res.message);
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k as keyof TcorFeesFormInput, { message: m });
        return;
      }
      toast.success("Cost of risk inputs saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Cost of risk inputs" className="flex flex-col gap-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Account inputs ($ per year, default zero)</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="tcor-fees" label="Broker fees" error={msg("brokerFees")}>
          <Input {...register("brokerFees")} {...fieldA11y("tcor-fees", msg("brokerFees"))} inputMode="decimal" />
        </Field>
        <Field id="tcor-risk" label="Risk control spend" error={msg("riskControlSpend")}>
          <Input {...register("riskControlSpend")} {...fieldA11y("tcor-risk", msg("riskControlSpend"))} inputMode="decimal" />
        </Field>
        <Field id="tcor-admin" label="Internal claims administration" error={msg("claimsAdminCost")}>
          <Input {...register("claimsAdminCost")} {...fieldA11y("tcor-admin", msg("claimsAdminCost"))} inputMode="decimal" />
        </Field>
      </div>
      <div>
        <Button type="submit" size="sm" disabled={!formState.isValid || pending || !formState.isDirty}>
          {pending ? "Saving…" : "Save inputs"}
        </Button>
      </div>
    </form>
  );
}
