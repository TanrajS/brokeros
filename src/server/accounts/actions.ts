"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db/client";
import { accounts } from "@/server/db/schema";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult } from "@/server/actionResult";
import { getWorkspaceBySlug } from "@/server/workspace/queries";
import { deleteUserBlobs } from "@/server/documents/cleanup";
import { accountFormSchema, type AccountFormInput } from "@/lib/schemas/account";

export async function createAccount(slug: string, input: AccountFormInput): Promise<ActionResult<{ id: string }>> {
  const parsed = accountFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const [row] = await db
      .insert(accounts)
      .values({ workspaceId: ws.id, ...parsed.data })
      .returning({ id: accounts.id });
    revalidatePath(`/w/${slug}`, "layout");
    return ok({ id: row.id });
  } catch (err) {
    return fail(describeFailure("creating the account", err));
  }
}

export async function updateAccount(slug: string, accountId: string, input: AccountFormInput): Promise<ActionResult> {
  const parsed = accountFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const updated = await db
      .update(accounts)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)))
      .returning({ id: accounts.id });
    if (updated.length === 0) return fail("That account no longer exists.");
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("saving the account", err));
  }
}

/** Deletes the account; its contacts and policies go with it (database cascade). */
export async function deleteAccount(slug: string, accountId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    // Document rows cascade with the account; their uploaded files do not, so remove those first.
    await deleteUserBlobs(db, ws.id, accountId);
    await db.delete(accounts).where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)));
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("deleting the account", err));
  }
}
