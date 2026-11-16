"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, fieldA11y } from "@/components/form/Field";
import { NativeSelect } from "@/components/form/NativeSelect";
import { ValueOrMissing } from "@/components/Missing";
import { daysBetween } from "@/lib/domain/dates";
import { isTaskOverdue } from "@/lib/domain/renewals";
import { describeDays, formatDate } from "@/lib/format";
import { taskFormSchema, type TaskFormInput, type TaskFormValues } from "@/lib/schemas/task";
import { createTask, deleteTask, generateStandardTasks, setTaskDone, updateTask } from "@/server/tasks/actions";

export interface TaskRow {
  id: string;
  title: string;
  dueDate: string;
  owner: string | null;
  done: boolean;
  policyId: string | null;
}

export interface PolicyOption {
  id: string;
  label: string;
}

interface Props {
  slug: string;
  accountId: string;
  asOf: string;
  tasks: TaskRow[];
  policyOptions: PolicyOption[];
  /** On a policy page: every task belongs to this policy, and the Generate button appears. */
  policyId?: string;
  defaultOwner: string | null;
}

type Editing = { mode: "create" } | { mode: "edit"; task: TaskRow } | null;

export function TasksSection({ slug, accountId, asOf, tasks, policyOptions, policyId, defaultOwner }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<TaskRow | null>(null);
  const policyLabel = new Map(policyOptions.map((p) => [p.id, p.label]));
  const [shown, setShown] = useOptimistic(tasks, (state, change: { id: string; done: boolean }) =>
    state.map((t) => (t.id === change.id ? { ...t, done: change.done } : t)),
  );
  const overdueCount = shown.filter((t) => isTaskOverdue(asOf, t.dueDate, t.done).value).length;

  function toggle(t: TaskRow) {
    startTransition(async () => {
      setShown({ id: t.id, done: !t.done });
      const res = await setTaskDone(slug, t.id, !t.done);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      router.refresh();
    });
  }

  function generate() {
    if (!policyId) return;
    startTransition(async () => {
      const res = await generateStandardTasks(slug, policyId);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      const { created, skippedPast, skippedExisting } = res.data;
      const parts = [`Created ${created} ${created === 1 ? "task" : "tasks"}`];
      if (skippedPast) parts.push(`skipped ${skippedPast} already due before ${formatDate(asOf)}`);
      if (skippedExisting) parts.push(`skipped ${skippedExisting} already on this policy`);
      (created > 0 ? toast.success : toast.info)(parts.join("; ") + ".");
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    startTransition(async () => {
      const res = await deleteTask(slug, target.id);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`Deleted "${target.title}"`);
      setDeleting(null);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="tasks-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="tasks-heading" className="text-lg font-semibold">
          Tasks
          {overdueCount > 0 ? (
            <Badge variant="destructive" className="ml-2 align-middle">
              {overdueCount} overdue
            </Badge>
          ) : null}
        </h2>
        <div className="flex flex-wrap gap-2">
          {policyId ? (
            <Button type="button" size="sm" variant="outline" onClick={generate} disabled={pending}>
              <ListChecks aria-hidden="true" />
              Generate standard renewal tasks
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ mode: "create" })}>
            <Plus aria-hidden="true" />
            Add task
          </Button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          No tasks yet.
          {policyId ? " Generate the standard renewal tasks (due 120, 90, 60 and 30 days before expiry) or add your own." : null}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Done</span>
                </TableHead>
                <TableHead>Task</TableHead>
                {policyId ? null : <TableHead>Policy</TableHead>}
                <TableHead>Due</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((t) => {
                const overdue = isTaskOverdue(asOf, t.dueDate, t.done).value;
                const days = daysBetween(asOf, t.dueDate).value;
                return (
                  <TableRow key={t.id} className={t.done ? "text-muted-foreground" : undefined}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={() => toggle(t)}
                        aria-label={`Mark "${t.title}" ${t.done ? "not done" : "done"}`}
                        className="size-4 accent-primary focus-visible:outline-3 focus-visible:outline-ring/50"
                      />
                    </TableCell>
                    <TableCell className={t.done ? "line-through" : "font-medium"}>{t.title}</TableCell>
                    {policyId ? null : (
                      <TableCell>
                        {t.policyId ? (
                          <Link href={`/w/${slug}/accounts/${accountId}/policies/${t.policyId}`} className="hover:underline">
                            {policyLabel.get(t.policyId) ?? "Policy"}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Account</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="whitespace-nowrap">
                      {formatDate(t.dueDate)}
                      <span className="block text-xs">
                        {t.done ? (
                          "Done"
                        ) : overdue ? (
                          <span className="font-medium text-destructive">Overdue, due {describeDays(days)}</span>
                        ) : (
                          <span className="text-muted-foreground">Due {describeDays(days)}</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ValueOrMissing text={t.owner} what="Owner" />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit "${t.title}"`} onClick={() => setEditing({ mode: "edit", task: t })}>
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete "${t.title}"`} onClick={() => setDeleting(t)}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {editing ? (
        <TaskDialog
          key={editing.mode === "edit" ? editing.task.id : "new"}
          slug={slug}
          accountId={accountId}
          asOf={asOf}
          editing={editing}
          policyOptions={policyOptions}
          fixedPolicyId={policyId}
          defaultOwner={defaultOwner}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleting?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>This removes the task. It cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={pending}>
              {pending ? "Deleting…" : "Delete task"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function TaskDialog({
  slug,
  accountId,
  asOf,
  editing,
  policyOptions,
  fixedPolicyId,
  defaultOwner,
  onClose,
}: {
  slug: string;
  accountId: string;
  asOf: string;
  editing: NonNullable<Editing>;
  policyOptions: PolicyOption[];
  fixedPolicyId?: string;
  defaultOwner: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const defaults: TaskFormInput =
    editing.mode === "edit"
      ? { title: editing.task.title, dueDate: editing.task.dueDate, owner: editing.task.owner ?? "", policyId: editing.task.policyId ?? "" }
      : { title: "", dueDate: asOf, owner: defaultOwner ?? "", policyId: fixedPolicyId ?? "" };
  const { register, handleSubmit, formState, getValues, setError } = useForm<TaskFormInput, unknown, TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: defaults,
    mode: "onChange",
  });
  const msg = (k: keyof TaskFormInput) => formState.errors[k]?.message;

  function onSubmit() {
    const raw = getValues();
    startTransition(async () => {
      const res = editing.mode === "edit" ? await updateTask(slug, editing.task.id, raw) : await createTask(slug, accountId, raw);
      if (!res.ok) {
        toast.error(res.message);
        for (const [field, message] of Object.entries(res.fieldErrors ?? {})) setError(field as keyof TaskFormInput, { message });
        return;
      }
      toast.success(editing.mode === "edit" ? "Task saved" : "Task added");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{editing.mode === "edit" ? "Edit task" : "Add task"}</DialogTitle>
            <DialogDescription>Overdue means due before {formatDate(asOf)} and not done.</DialogDescription>
          </DialogHeader>
          <Field id="task-title" label="Title" required error={msg("title")}>
            <Input {...register("title")} {...fieldA11y("task-title", msg("title"))} autoComplete="off" />
          </Field>
          <Field id="task-due" label="Due date" required error={msg("dueDate")}>
            <Input type="date" {...register("dueDate")} {...fieldA11y("task-due", msg("dueDate"))} />
          </Field>
          <Field id="task-owner" label="Owner" error={msg("owner")}>
            <Input {...register("owner")} {...fieldA11y("task-owner", msg("owner"))} />
          </Field>
          {fixedPolicyId ? null : (
            <Field id="task-policy" label="Policy" error={msg("policyId")}>
              <NativeSelect {...register("policyId")} {...fieldA11y("task-policy", msg("policyId"))}>
                <option value="">Whole account</option>
                {policyOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!formState.isValid || pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
