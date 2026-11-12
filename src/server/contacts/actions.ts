"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db/client";
import { accounts, contacts } from "@/server/db/schema";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult } from "@/server/actionResult";
import { getWorkspaceBySlug } from "@/server/workspace/queries";
import { contactFormSchema, type ContactFormInput } from "@/lib/schemas/contact";

export async function createContact(slug: string, accountId: string, input: ContactFormInput): Promise<ActionResult<{ id: string }>> {
  const parsed = contactFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const owner = await db.query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) });
    if (!owner) return fail("That account no longer exists.");
    const [row] = await db
      .insert(contacts)
      .values({ workspaceId: ws.id, accountId, ...parsed.data })
      .returning({ id: contacts.id });
    revalidatePath(`/w/${slug}`, "layout");
    return ok({ id: row.id });
  } catch (err) {
    return fail(describeFailure("adding the contact", err));
  }
}

export async function updateContact(slug: string, contactId: string, input: ContactFormInput): Promise<ActionResult> {
  const parsed = contactFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const updated = await db
      .update(contacts)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, ws.id)))
      .returning({ id: contacts.id });
    if (updated.length === 0) return fail("That contact no longer exists.");
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("saving the contact", err));
  }
}

export async function deleteContact(slug: string, contactId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    await db.delete(contacts).where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, ws.id)));
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("deleting the contact", err));
  }
}
