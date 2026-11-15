"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { quoteOptionFormSchema, tcorFeesFormSchema, toleranceFormSchema, type QuoteOptionFormInput, type TcorFeesFormInput, type ToleranceFormInput } from "@/lib/schemas/strategy";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult } from "@/server/actionResult";
import { getDb } from "@/server/db/client";
import { accounts, policies, quoteOptions } from "@/server/db/schema";
import { getWorkspaceBySlug } from "@/server/workspace/queries";

function refresh(slug: string) {
  revalidatePath(`/w/${slug}`, "layout");
}

/** Creates or edits a retention option by hand. */
export async function saveQuoteOption(slug: string, policyId: string, optionId: string | null, input: QuoteOptionFormInput): Promise<ActionResult<{ id: string }>> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const parsed = quoteOptionFormSchema.safeParse(input);
    if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
    const db = getDb();
    const policy = await db.query.policies.findFirst({ where: and(eq(policies.id, policyId), eq(policies.workspaceId, ws.id)) });
    if (!policy) return fail("That policy no longer exists.");
    const v = parsed.data;
    if (optionId) {
      const [row] = await db
        .update(quoteOptions)
        .set({ label: v.label, carrier: v.carrier, deductible: v.deductible, aggregateCap: v.aggregateCap, premium: v.premium, updatedAt: new Date() })
        .where(and(eq(quoteOptions.id, optionId), eq(quoteOptions.workspaceId, ws.id), eq(quoteOptions.policyId, policyId)))
        .returning({ id: quoteOptions.id });
      if (!row) return fail("That option no longer exists.");
      refresh(slug);
      return ok({ id: row.id });
    }
    const [row] = await db
      .insert(quoteOptions)
      .values({ workspaceId: ws.id, policyId, label: v.label, carrier: v.carrier, deductible: v.deductible, aggregateCap: v.aggregateCap, premium: v.premium })
      .returning({ id: quoteOptions.id });
    refresh(slug);
    return ok({ id: row.id });
  } catch (err) {
    return fail(describeFailure("saving the retention option", err));
  }
}

export async function deleteQuoteOption(slug: string, optionId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const rows = await getDb().delete(quoteOptions).where(and(eq(quoteOptions.id, optionId), eq(quoteOptions.workspaceId, ws.id))).returning({ id: quoteOptions.id });
    if (rows.length === 0) return fail("That option no longer exists.");
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("deleting the retention option", err));
  }
}

/** The account's broker fees, risk control spend and internal claims administration for TCOR. */
export async function saveTcorFees(slug: string, accountId: string, input: TcorFeesFormInput): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const parsed = tcorFeesFormSchema.safeParse(input);
    if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
    const v = parsed.data;
    const rows = await getDb()
      .update(accounts)
      .set({ brokerFees: v.brokerFees, riskControlSpend: v.riskControlSpend, claimsAdminCost: v.claimsAdminCost, updatedAt: new Date() })
      .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)))
      .returning({ id: accounts.id });
    if (rows.length === 0) return fail("That account no longer exists.");
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("saving the cost of risk inputs", err));
  }
}

/** v1.4: the account's risk tolerances and permissible loss ratio. Blank tolerances mean the defaults from revenue. */
export async function saveToleranceSettings(slug: string, accountId: string, input: ToleranceFormInput): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const parsed = toleranceFormSchema.safeParse(input);
    if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
    const v = parsed.data;
    const rows = await getDb()
      .update(accounts)
      .set({ toleranceOccurrence: v.toleranceOccurrence, toleranceYear: v.toleranceYear, permissibleLossRatio: v.permissibleLossRatio, updatedAt: new Date() })
      .where(and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)))
      .returning({ id: accounts.id });
    if (rows.length === 0) return fail("That account no longer exists.");
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("saving the tolerance settings", err));
  }
}

/** v1.4: accept a finding into the report, or take it back out. Stored as the finding's stable key on the account. */
export async function setFindingAccepted(slug: string, accountId: string, findingId: string, accepted: boolean): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    if (!/^[a-z_]+:[A-Za-z0-9_.:-]+$/.test(findingId)) return fail("That finding key is not valid.");
    const db = getDb();
    const account = await db.query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) });
    if (!account) return fail("That account no longer exists.");
    const next = accepted ? [...new Set([...account.acceptedFindings, findingId])] : account.acceptedFindings.filter((f) => f !== findingId);
    await db.update(accounts).set({ acceptedFindings: next, updatedAt: new Date() }).where(eq(accounts.id, accountId));
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("updating the report findings", err));
  }
}
