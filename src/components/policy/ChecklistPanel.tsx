"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeCheckbox } from "@/components/form/Checkbox";
import { ReadinessMeter } from "@/components/renewals/ReadinessMeter";
import { checklistReadiness } from "@/lib/domain/renewals";
import { customChecklistItemSchema, type CustomChecklistItemInput, type CustomChecklistItemValues } from "@/lib/schemas/checklist";
import { addChecklistItem, deleteChecklistItem, setChecklistItemDone } from "@/server/checklist/actions";

export interface ChecklistRow {
  id: string;
  label: string;
  required: boolean;
  done: boolean;
  source: "common" | "line" | "custom";
}

export function ChecklistPanel({ slug, policyId, items }: { slug: string; policyId: string; items: ChecklistRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Ticks show immediately; the server result replaces them on refresh.
  const [shown, setShown] = useOptimistic(items, (state, change: { id: string; done: boolean }) =>
    state.map((i) => (i.id === change.id ? { ...i, done: change.done } : i)),
  );
  const readiness = checklistReadiness(shown.filter((i) => i.done).length, shown.length).value;

  const { register, handleSubmit, formState, getValues, setError, reset } = useForm<CustomChecklistItemInput, unknown, CustomChecklistItemValues>({
    resolver: zodResolver(customChecklistItemSchema),
    defaultValues: { label: "", required: true },
    mode: "onChange",
  });

  function toggle(id: string, done: boolean) {
    startTransition(async () => {
      setShown({ id, done });
      const res = await setChecklistItemDone(slug, id, done);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      router.refresh();
    });
  }

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, success?: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.message ?? "That did not go through.");
        return;
      }
      if (success) toast.success(success);
      router.refresh();
    });
  }

  function onAdd() {
    const raw = getValues();
    startTransition(async () => {
      const res = await addChecklistItem(slug, policyId, raw);
      if (!res.ok) {
        toast.error(res.message);
        if (res.fieldErrors?.label) setError("label", { message: res.fieldErrors.label });
        return;
      }
      toast.success("Checklist item added");
      reset({ label: "", required: true });
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="checklist-heading" className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="checklist-heading" className="text-lg font-semibold">
          Readiness checklist
        </h2>
        {readiness.readyToMarket ? (
          <Badge className="gap-1 bg-emerald-600 text-white">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            Ready to market
          </Badge>
        ) : null}
      </div>
      <ReadinessMeter readiness={readiness} className="max-w-xs" />

      <ul className="flex flex-col gap-2">
        {shown.map((i) => (
          <li key={i.id} className="flex items-center gap-2">
            <NativeCheckbox
              id={`check-${i.id}`}
              label={i.label}
              checked={i.done}
              onChange={() => toggle(i.id, !i.done)}
              className={i.done ? "text-muted-foreground line-through" : undefined}
            />
            {i.source === "line" ? <Badge variant="secondary">Line-specific</Badge> : null}
            {i.source === "custom" ? <Badge variant="outline">Custom</Badge> : null}
            {!i.required ? <Badge variant="outline">Optional</Badge> : null}
            {i.source === "custom" ? (
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Remove "${i.label}"`}
                disabled={pending}
                onClick={() => run(() => deleteChecklistItem(slug, i.id), "Item removed")}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmit(onAdd)} noValidate className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-end">
        <Field id="custom-item" label="Add a custom item" error={formState.errors.label?.message} className="flex flex-1 flex-col gap-1.5">
          <Input {...register("label")} {...fieldA11y("custom-item", formState.errors.label?.message)} placeholder="e.g. Fleet telematics report" autoComplete="off" />
        </Field>
        <NativeCheckbox id="custom-required" label="Required" {...register("required")} className="sm:pb-2" />
        <Button type="submit" variant="outline" disabled={!formState.isValid || pending}>
          <Plus aria-hidden="true" />
          Add item
        </Button>
      </form>
    </section>
  );
}
