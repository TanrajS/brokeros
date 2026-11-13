"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { noteFormSchema, type NoteFormInput } from "@/lib/schemas/activity";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult } from "@/server/actionResult";
import { getDb } from "@/server/db/client";
import { accounts, activities } from "@/server/db/schema";
import { getWorkspaceBySlug } from "@/server/workspace/queries";

export async function addNote(slug: string, accountId: string, input: NoteFormInput): Promise<ActionResult> {
  const parsed = noteFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const account = await db.query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) });
    if (!account) return fail("That account no longer exists.");
    await db.insert(activities).values({
      workspaceId: ws.id,
      accountId,
      policyId: null,
      kind: "note",
      body: parsed.data.body,
      asOfDate: ws.asOfDate,
    });
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("adding the note", err));
  }
}

/** Notes can be deleted; automatic entries are the audit trail and cannot. */
export async function deleteNote(slug: string, activityId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const row = await db.query.activities.findFirst({ where: and(eq(activities.id, activityId), eq(activities.workspaceId, ws.id)) });
    if (!row) return fail("That note no longer exists.");
    if (row.kind !== "note") return fail("Automatic activity entries cannot be deleted.");
    await db.delete(activities).where(eq(activities.id, activityId));
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("deleting the note", err));
  }
}
