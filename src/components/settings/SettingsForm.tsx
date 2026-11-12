"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, fieldA11y } from "@/components/form/Field";
import { workspaceSettingsSchema, type WorkspaceSettingsInput, type WorkspaceSettingsValues } from "@/lib/schemas/workspace";
import { updateWorkspaceSettings } from "@/server/workspace/actions";

export function SettingsForm({ slug, defaultValues }: { slug: string; defaultValues: WorkspaceSettingsInput }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, formState, getValues, setError, reset } = useForm<WorkspaceSettingsInput, unknown, WorkspaceSettingsValues>({
    resolver: zodResolver(workspaceSettingsSchema),
    defaultValues,
    mode: "onChange",
  });
  const errors = formState.errors;

  function onSubmit() {
    const raw = getValues();
    startTransition(async () => {
      const res = await updateWorkspaceSettings(slug, raw);
      if (!res.ok) {
        toast.error(res.message);
        for (const [field, message] of Object.entries(res.fieldErrors ?? {})) setError(field as keyof WorkspaceSettingsInput, { message });
        return;
      }
      toast.success("Settings saved");
      reset(raw);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-md flex-col gap-4">
      <Field id="name" label="Workspace name" required error={errors.name?.message}>
        <Input {...register("name")} {...fieldA11y("name", errors.name?.message)} />
      </Field>
      <Field
        id="as-of"
        label="As-of date"
        required
        error={errors.asOfDate?.message}
        hint="Every days-to-expiry number in the app is counted from this date, never from today's clock."
      >
        <Input type="date" {...register("asOfDate")} {...fieldA11y("as-of", errors.asOfDate?.message, "as-of hint")} />
      </Field>
      <div>
        <Button type="submit" disabled={!formState.isValid || !formState.isDirty || pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
