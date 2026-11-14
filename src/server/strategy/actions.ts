"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { formatCurrency } from "@/lib/format";
import { quoteOptionFormSchema, tcorFeesFormSchema, type QuoteOptionFormInput, type TcorFeesFormInput } from "@/lib/schemas/strategy";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult } from "@/server/actionResult";
import { getDb } from "@/server/db/client";
import { accounts, policies, quoteOptions, quotes, submissions } from "@/server/db/schema";
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
      .values({ workspaceId: ws.id, policyId, label: v.label, carrier: v.carrier, deductible: v.deductible, aggregateCap: v.aggregateCap, premium: v.premium, sourceQuoteId: null })
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

/**
 * Imports quotes recorded in Marketing as retention options: the quote's
 * deductible and premium, the submission's carrier, and a link back to the quote.
 * Quotes without a deductible, or already imported, are skipped and reported.
 */
export async function importQuoteOptions(slug: string, policyId: string, quoteIds: string[]): Promise<ActionResult<{ imported: number; skipped: string[] }>> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const ids = [...new Set(quoteIds)].filter((id) => /^[0-9a-f-]{36}$/.test(id));
    if (ids.length === 0) return fail("Choose at least one quote to import.");
    const db = getDb();
    const [rows, existing] = await Promise.all([
      db
        .select({ quote: quotes, carrier: submissions.carrier })
        .from(quotes)
        .innerJoin(submissions, eq(submissions.id, quotes.submissionId))
        .where(and(eq(submissions.workspaceId, ws.id), eq(submissions.policyId, policyId), inArray(quotes.id, ids))),
      db.select({ sourceQuoteId: quoteOptions.sourceQuoteId }).from(quoteOptions).where(and(eq(quoteOptions.workspaceId, ws.id), eq(quoteOptions.policyId, policyId))),
    ]);
    if (rows.length === 0) return fail("Those quotes do not belong to this policy.");
    const imported = new Set(existing.map((e) => e.sourceQuoteId));
    const skipped: string[] = [];
    const values: (typeof quoteOptions.$inferInsert)[] = [];
    for (const { quote, carrier } of rows) {
      if (imported.has(quote.id)) {
        skipped.push(`${carrier} ${formatCurrency(quote.quotedPremium)}: already imported`);
        continue;
      }
      if (quote.deductible === null) {
        skipped.push(`${carrier} ${formatCurrency(quote.quotedPremium)}: no deductible on the quote`);
        continue;
      }
      values.push({ workspaceId: ws.id, policyId, label: `${formatCurrency(quote.deductible)} deductible`, carrier, deductible: quote.deductible, aggregateCap: null, premium: quote.quotedPremium, sourceQuoteId: quote.id });
    }
    if (values.length > 0) await db.insert(quoteOptions).values(values);
    refresh(slug);
    return ok({ imported: values.length, skipped });
  } catch (err) {
    return fail(describeFailure("importing quotes", err));
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
