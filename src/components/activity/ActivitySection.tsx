"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field, fieldA11y } from "@/components/form/Field";
import { ACTIVITY_KIND_LABELS, type ActivityKind } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { noteFormSchema, type NoteFormInput, type NoteFormValues } from "@/lib/schemas/activity";
import { addNote, deleteNote } from "@/server/activities/actions";

export interface ActivityRow {
  id: string;
  kind: ActivityKind;
  body: string;
  asOfDate: string;
}

const kindVariant: Record<ActivityKind, "default" | "secondary" | "outline" | "destructive"> = {
  note: "outline",
  stage_change: "secondary",
  checklist_complete: "default",
  outcome_recorded: "default",
  outcome_undone: "destructive",
};

export function ActivitySection({ slug, accountId, activities }: { slug: string; accountId: string; activities: ActivityRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<ActivityRow | null>(null);
  const { register, handleSubmit, formState, getValues, setError, reset } = useForm<NoteFormInput, unknown, NoteFormValues>({
    resolver: zodResolver(noteFormSchema),
    defaultValues: { body: "" },
    mode: "onChange",
  });

  function onSubmit() {
    const raw = getValues();
    startTransition(async () => {
      const res = await addNote(slug, accountId, raw);
      if (!res.ok) {
        toast.error(res.message);
        if (res.fieldErrors?.body) setError("body", { message: res.fieldErrors.body });
        return;
      }
      toast.success("Note added");
      reset({ body: "" });
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const id = deleting.id;
    startTransition(async () => {
      const res = await deleteNote(slug, id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Note deleted");
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="activity-heading" className="flex flex-col gap-3">
      <h2 id="activity-heading" className="text-lg font-semibold">
        Activity
      </h2>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-2">
        <Field id="note-body" label="Add a note" error={formState.errors.body?.message}>
          <Textarea {...register("body")} {...fieldA11y("note-body", formState.errors.body?.message)} rows={3} />
        </Field>
        <div>
          <Button type="submit" size="sm" disabled={!formState.isValid || pending}>
            {pending ? "Saving…" : "Add note"}
          </Button>
        </div>
      </form>

      {activities.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          No activity yet. Stage changes, completed checklists and outcomes are logged here automatically.
        </p>
      ) : (
        <ol className="flex flex-col divide-y rounded-lg border" aria-label="Activity, newest first">
          {activities.map((a) => (
            <li key={a.id} className="flex items-start gap-3 p-3 text-sm">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={kindVariant[a.kind]}>{ACTIVITY_KIND_LABELS[a.kind]}</Badge>
                  <span className="text-xs text-muted-foreground">As of {formatDate(a.asOfDate)}</span>
                </div>
                <p className="whitespace-pre-line break-words">{a.body}</p>
              </div>
              {a.kind === "note" ? (
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Delete note" onClick={() => setDeleting(a)}>
                  <Trash2 aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>Automatic entries stay; only this note is removed. It cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={pending}>
              {pending ? "Deleting…" : "Delete note"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
