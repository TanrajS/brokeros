"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db/client";
import { accounts, workspaces } from "@/server/db/schema";
import { DEMO_WORKSPACE_NAME, loadDemoBook } from "@/server/db/seed/demoBook";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult } from "@/server/actionResult";
import { RESET_CONFIRMATION, workspaceSettingsSchema, type WorkspaceSettingsInput } from "@/lib/schemas/workspace";
import { getExecutor } from "@/server/db/tx";
import { syncStages } from "@/server/renewals/stages";
import { deleteUserBlobs } from "@/server/documents/cleanup";
import { writeWorkspaceCookie } from "./cookie";
import { countAccounts, createWorkspace, getWorkspaceBySlug, todayISO } from "./queries";

/** Remembers the workspace at `slug` as this browser's workspace (used when opening a shared link). */
export async function adoptWorkspace(slug: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    await writeWorkspaceCookie(ws.id);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("remembering the workspace", err));
  }
}

export async function updateWorkspaceSettings(slug: string, input: WorkspaceSettingsInput): Promise<ActionResult> {
  const parsed = workspaceSettingsSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    await db
      .update(workspaces)
      .set({ name: parsed.data.name, asOfDate: parsed.data.asOfDate, updatedAt: new Date() })
      .where(eq(workspaces.id, ws.id));
    // A new as-of date can move policies between stages; log each move.
    if (parsed.data.asOfDate !== ws.asOfDate) await syncStages(getExecutor(), ws.id, parsed.data.asOfDate);
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("saving settings", err));
  }
}

/**
 * Loads the demo book. Refuses to touch a non-empty workspace unless `replace`
 * is true, in which case every account (and its contacts and policies) is deleted first.
 */
export async function loadDemoBookAction(slug: string, options: { replace: boolean }): Promise<ActionResult<{ accounts: number; policies: number }>> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const existing = await countAccounts(ws.id);
    if (existing > 0 && !options.replace) {
      return fail("This workspace already has accounts. Confirm replacement to load the demo book over them.");
    }
    const db = getDb();
    if (existing > 0) {
      await deleteUserBlobs(db, ws.id);
      await db.delete(accounts).where(eq(accounts.workspaceId, ws.id));
    }
    const summary = await loadDemoBook(db, ws.id, ws.asOfDate);
    revalidatePath(`/w/${slug}`, "layout");
    return ok({ accounts: summary.accounts, policies: summary.policies });
  } catch (err) {
    return fail(describeFailure("loading the demo book", err));
  }
}

/** Creates a fresh workspace seeded with the demo book, switches the cookie to it and redirects. */
export async function newWorkspaceFromDemo(): Promise<ActionResult> {
  let slug: string;
  try {
    const ws = await createWorkspace({ name: DEMO_WORKSPACE_NAME, asOfDate: todayISO() });
    await loadDemoBook(getDb(), ws.id, ws.asOfDate);
    await writeWorkspaceCookie(ws.id);
    slug = ws.slug;
  } catch (err) {
    return fail(describeFailure("creating a demo workspace", err));
  }
  redirect(`/w/${slug}`);
}

/** Creates a fresh empty workspace, switches the cookie to it and redirects. */
export async function newEmptyWorkspace(): Promise<ActionResult> {
  let slug: string;
  try {
    const ws = await createWorkspace({ name: "My brokerage", asOfDate: todayISO() });
    await writeWorkspaceCookie(ws.id);
    slug = ws.slug;
  } catch (err) {
    return fail(describeFailure("creating a workspace", err));
  }
  redirect(`/w/${slug}`);
}

/** Deletes every account, contact and policy in the workspace. Requires the typed confirmation. */
export async function resetWorkspace(slug: string, confirmation: string): Promise<ActionResult> {
  if (confirmation !== RESET_CONFIRMATION) {
    return fail(`Type ${RESET_CONFIRMATION} to confirm.`, { confirmation: `Type ${RESET_CONFIRMATION} exactly` });
  }
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    await deleteUserBlobs(db, ws.id);
    await db.delete(accounts).where(eq(accounts.workspaceId, ws.id));
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("resetting the workspace", err));
  }
}
