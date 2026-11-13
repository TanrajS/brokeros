"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { planStandardRenewalTasks } from "@/lib/domain/renewals";
import { taskFormSchema, type TaskFormInput, type TaskFormValues } from "@/lib/schemas/task";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult } from "@/server/actionResult";
import { getDb } from "@/server/db/client";
import { accounts, policies, tasks } from "@/server/db/schema";
import { getWorkspaceBySlug } from "@/server/workspace/queries";

async function policyBelongsToAccount(workspaceId: string, accountId: string, policyId: string | null): Promise<boolean> {
  if (!policyId) return true;
  const db = getDb();
  const p = await db.query.policies.findFirst({
    where: and(eq(policies.id, policyId), eq(policies.workspaceId, workspaceId), eq(policies.accountId, accountId)),
  });
  return !!p;
}

export async function createTask(slug: string, accountId: string, input: TaskFormInput): Promise<ActionResult<{ id: string }>> {
  const parsed = taskFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const owner = await db.query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) });
    if (!owner) return fail("That account no longer exists.");
    if (!(await policyBelongsToAccount(ws.id, accountId, parsed.data.policyId))) {
      return fail("Please fix the highlighted fields.", { policyId: "Choose a policy on this account" });
    }
    const [row] = await db
      .insert(tasks)
      .values({ workspaceId: ws.id, accountId, ...parsed.data })
      .returning({ id: tasks.id });
    revalidatePath(`/w/${slug}`, "layout");
    return ok({ id: row.id });
  } catch (err) {
    return fail(describeFailure("adding the task", err));
  }
}

export async function updateTask(slug: string, taskId: string, input: TaskFormInput): Promise<ActionResult> {
  const parsed = taskFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const existing = await db.query.tasks.findFirst({ where: and(eq(tasks.id, taskId), eq(tasks.workspaceId, ws.id)) });
    if (!existing) return fail("That task no longer exists.");
    if (!(await policyBelongsToAccount(ws.id, existing.accountId, parsed.data.policyId))) {
      return fail("Please fix the highlighted fields.", { policyId: "Choose a policy on this account" });
    }
    await db.update(tasks).set({ ...(parsed.data satisfies TaskFormValues), updatedAt: new Date() }).where(eq(tasks.id, taskId));
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("saving the task", err));
  }
}

export async function setTaskDone(slug: string, taskId: string, done: boolean): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const updated = await db
      .update(tasks)
      .set({ done, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, ws.id)))
      .returning({ id: tasks.id });
    if (updated.length === 0) return fail("That task no longer exists.");
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("updating the task", err));
  }
}

export async function deleteTask(slug: string, taskId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    await getDb().delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, ws.id)));
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("deleting the task", err));
  }
}

export interface GenerateTasksResult {
  created: number;
  skippedPast: number;
  skippedExisting: number;
}

/** Creates the four standard renewal tasks for a policy, skipping past-due and duplicate ones. */
export async function generateStandardTasks(slug: string, policyId: string): Promise<ActionResult<GenerateTasksResult>> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const policy = await db.query.policies.findFirst({ where: and(eq(policies.id, policyId), eq(policies.workspaceId, ws.id)) });
    if (!policy) return fail("That policy no longer exists.");
    const account = await db.query.accounts.findFirst({ where: eq(accounts.id, policy.accountId) });
    const existing = await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.policyId, policy.id));
    const plan = planStandardRenewalTasks(ws.asOfDate, policy.expiryDate, existing.map((t) => t.title)).value;
    if (plan.create.length > 0) {
      await db.insert(tasks).values(
        plan.create.map((t) => ({
          workspaceId: ws.id,
          accountId: policy.accountId,
          policyId: policy.id,
          title: t.title,
          dueDate: t.dueDate,
          owner: account?.accountManager ?? account?.producer ?? null,
          done: false,
        })),
      );
    }
    revalidatePath(`/w/${slug}`, "layout");
    return ok({ created: plan.create.length, skippedPast: plan.skippedPast.length, skippedExisting: plan.skippedExisting.length });
  } catch (err) {
    return fail(describeFailure("generating renewal tasks", err));
  }
}
