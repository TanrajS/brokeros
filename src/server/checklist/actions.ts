"use server";

import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { checklistReadiness } from "@/lib/domain/renewals";
import { customChecklistItemSchema, type CustomChecklistItemInput } from "@/lib/schemas/checklist";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult } from "@/server/actionResult";
import { getDb } from "@/server/db/client";
import { checklistItems, policies, type Policy } from "@/server/db/schema";
import { withTransaction, type Executor } from "@/server/db/tx";
import { logActivities, policyLabel } from "@/server/renewals/activityLog";
import { getWorkspaceBySlug } from "@/server/workspace/queries";

async function isComplete(db: Executor, policyId: string): Promise<boolean> {
  const items = await db.select({ done: checklistItems.done }).from(checklistItems).where(eq(checklistItems.policyId, policyId));
  return checklistReadiness(items.filter((i) => i.done).length, items.length).value.readyToMarket;
}

/** Runs a checklist change and logs an activity if it takes the checklist to 100%. */
async function changeChecklist(
  workspace: { id: string; asOfDate: string },
  policy: Policy,
  change: (tx: Executor) => Promise<void>,
): Promise<void> {
  await withTransaction(async (tx) => {
    const before = await isComplete(tx, policy.id);
    await change(tx);
    const after = await isComplete(tx, policy.id);
    if (!before && after) {
      await logActivities(tx, [
        {
          workspaceId: workspace.id,
          accountId: policy.accountId,
          policyId: policy.id,
          kind: "checklist_complete",
          body: `${policyLabel(policy)} readiness checklist is complete: ready to market.`,
          asOfDate: workspace.asOfDate,
        },
      ]);
    }
  });
}

async function loadItem(slug: string, itemId: string) {
  const ws = await getWorkspaceBySlug(slug);
  if (!ws) return null;
  const db = getDb();
  const item = await db.query.checklistItems.findFirst({ where: and(eq(checklistItems.id, itemId), eq(checklistItems.workspaceId, ws.id)) });
  if (!item) return null;
  const policy = await db.query.policies.findFirst({ where: eq(policies.id, item.policyId) });
  if (!policy) return null;
  return { ws, item, policy };
}

export async function setChecklistItemDone(slug: string, itemId: string, done: boolean): Promise<ActionResult> {
  try {
    const ctx = await loadItem(slug, itemId);
    if (!ctx) return fail("That checklist item no longer exists.");
    await changeChecklist(ctx.ws, ctx.policy, async (tx) => {
      await tx.update(checklistItems).set({ done, updatedAt: new Date() }).where(eq(checklistItems.id, itemId));
    });
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("updating the checklist", err));
  }
}

export async function addChecklistItem(slug: string, policyId: string, input: CustomChecklistItemInput): Promise<ActionResult> {
  const parsed = customChecklistItemSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const policy = await db.query.policies.findFirst({ where: and(eq(policies.id, policyId), eq(policies.workspaceId, ws.id)) });
    if (!policy) return fail("That policy no longer exists.");
    const dup = await db.query.checklistItems.findFirst({
      where: and(eq(checklistItems.policyId, policyId), eq(checklistItems.label, parsed.data.label)),
    });
    if (dup) return fail("Please fix the highlighted fields.", { label: "That item is already on the checklist" });
    const [{ top }] = await db.select({ top: max(checklistItems.sortOrder) }).from(checklistItems).where(eq(checklistItems.policyId, policyId));
    await db.insert(checklistItems).values({
      workspaceId: ws.id,
      policyId,
      label: parsed.data.label,
      required: parsed.data.required,
      done: false,
      source: "custom",
      sortOrder: (top ?? -1) + 1,
    });
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("adding the checklist item", err));
  }
}

/** Only custom items can be removed; the standard ones define readiness. */
export async function deleteChecklistItem(slug: string, itemId: string): Promise<ActionResult> {
  try {
    const ctx = await loadItem(slug, itemId);
    if (!ctx) return fail("That checklist item no longer exists.");
    if (ctx.item.source !== "custom") return fail("Standard checklist items cannot be removed.");
    await changeChecklist(ctx.ws, ctx.policy, async (tx) => {
      await tx.delete(checklistItems).where(eq(checklistItems.id, itemId));
    });
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("removing the checklist item", err));
  }
}
