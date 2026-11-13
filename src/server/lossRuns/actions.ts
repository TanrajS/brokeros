"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { assignPolicyYear, policyPeriods, validateImportRows, type LRPolicy } from "@/lib/domain/lossRuns";
import type { LineOfBusiness } from "@/lib/constants";
import { claimFormSchema, type ClaimFormInput } from "@/lib/schemas/claim";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult } from "@/server/actionResult";
import { getDb } from "@/server/db/client";
import { accounts, claims, policies, type Workspace } from "@/server/db/schema";
import { withTransaction } from "@/server/db/tx";
import { getWorkspaceBySlug } from "@/server/workspace/queries";

/** Most rows a single import accepts (keeps the request well under the 4.5 MB function body limit). */
const MAX_IMPORT_ROWS = 2000;

async function accountPolicies(workspaceId: string, accountId: string): Promise<LRPolicy[]> {
  const rows = await getDb()
    .select()
    .from(policies)
    .where(and(eq(policies.workspaceId, workspaceId), eq(policies.accountId, accountId)));
  return rows.map((p) => ({
    id: p.id,
    lineOfBusiness: p.lineOfBusiness,
    effectiveDate: p.effectiveDate,
    expiryDate: p.expiryDate,
    annualPremium: p.annualPremium,
    exposureBasis: p.exposureBasis,
    exposureAmount: p.exposureAmount,
    previousPolicyId: p.previousPolicyId,
  }));
}

/** The chosen policy must be on the account and in the claim's line. Blank: link the policy whose term contains the loss date, if any. */
function resolvePolicyLink(all: LRPolicy[], line: LineOfBusiness, dateOfLoss: string, chosen: string | null): { policyId: string | null; error: string | null } {
  if (chosen) {
    const p = all.find((x) => x.id === chosen);
    if (!p) return { policyId: null, error: "Choose a policy on this account" };
    if (p.lineOfBusiness !== line) return { policyId: null, error: "Choose a policy in the same line as the claim" };
    return { policyId: chosen, error: null };
  }
  const period = assignPolicyYear({ dateOfLoss, policyId: null }, policyPeriods(all, line).value).value;
  return { policyId: period?.policyId ?? null, error: null };
}

async function existingNumbers(workspaceId: string, accountId: string, exceptId?: string): Promise<string[]> {
  const rows = await getDb()
    .select({ id: claims.id, claimNumber: claims.claimNumber })
    .from(claims)
    .where(and(eq(claims.workspaceId, workspaceId), eq(claims.accountId, accountId)));
  return rows.filter((r) => r.id !== exceptId).map((r) => r.claimNumber);
}

async function loadAccount(slug: string, accountId: string): Promise<Workspace | null> {
  const ws = await getWorkspaceBySlug(slug);
  if (!ws) return null;
  const account = await getDb().query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) });
  return account ? ws : null;
}

const isDuplicate = (numbers: string[], n: string) => numbers.some((x) => x.trim().toLowerCase() === n.trim().toLowerCase());

export async function createClaim(slug: string, accountId: string, input: ClaimFormInput): Promise<ActionResult<{ duplicate: boolean }>> {
  try {
    const ws = await loadAccount(slug, accountId);
    if (!ws) return fail("That account no longer exists.");
    const parsed = claimFormSchema(ws.asOfDate).safeParse(input);
    if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
    const v = parsed.data;
    const link = resolvePolicyLink(await accountPolicies(ws.id, accountId), v.lineOfBusiness, v.dateOfLoss, v.policyId);
    if (link.error) return fail("Please fix the highlighted fields.", { policyId: link.error });
    const duplicate = isDuplicate(await existingNumbers(ws.id, accountId), v.claimNumber);
    await getDb().insert(claims).values({
      workspaceId: ws.id,
      accountId,
      policyId: link.policyId,
      lineOfBusiness: v.lineOfBusiness,
      claimNumber: v.claimNumber,
      dateOfLoss: v.dateOfLoss,
      dateReported: v.dateReported,
      description: v.description,
      paid: v.paid,
      reserved: v.reserved,
      status: v.status,
    });
    revalidatePath(`/w/${slug}`, "layout");
    return ok({ duplicate });
  } catch (err) {
    return fail(describeFailure("adding the claim", err));
  }
}

export async function updateClaim(slug: string, claimId: string, input: ClaimFormInput): Promise<ActionResult<{ duplicate: boolean }>> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const existing = await getDb().query.claims.findFirst({ where: and(eq(claims.id, claimId), eq(claims.workspaceId, ws.id)) });
    if (!existing) return fail("That claim no longer exists.");
    const parsed = claimFormSchema(ws.asOfDate).safeParse(input);
    if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
    const v = parsed.data;
    const link = resolvePolicyLink(await accountPolicies(ws.id, existing.accountId), v.lineOfBusiness, v.dateOfLoss, v.policyId);
    if (link.error) return fail("Please fix the highlighted fields.", { policyId: link.error });
    const duplicate = isDuplicate(await existingNumbers(ws.id, existing.accountId, claimId), v.claimNumber);
    await getDb()
      .update(claims)
      .set({
        policyId: link.policyId,
        lineOfBusiness: v.lineOfBusiness,
        claimNumber: v.claimNumber,
        dateOfLoss: v.dateOfLoss,
        dateReported: v.dateReported,
        description: v.description,
        paid: v.paid,
        reserved: v.reserved,
        status: v.status,
        updatedAt: new Date(),
      })
      .where(eq(claims.id, claimId));
    revalidatePath(`/w/${slug}`, "layout");
    return ok({ duplicate });
  } catch (err) {
    return fail(describeFailure("saving the claim", err));
  }
}

export async function deleteClaim(slug: string, claimId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    await getDb().delete(claims).where(and(eq(claims.id, claimId), eq(claims.workspaceId, ws.id)));
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("deleting the claim", err));
  }
}

export interface ImportResult {
  imported: number;
  total: number;
  skipped: { row: number; claimNumber: string; reasons: string[] }[];
}

/**
 * Imports parsed CSV rows. The server re-validates every row with the same
 * domain function the preview used, then inserts all valid rows in one
 * transaction: either every valid row lands or none does.
 */
export async function importClaims(
  slug: string,
  accountId: string,
  rows: Record<string, string>[],
  confirmClosedWithReserve: boolean,
): Promise<ActionResult<ImportResult>> {
  if (!Array.isArray(rows) || rows.length === 0) return fail("The file has no rows to import.");
  if (rows.length > MAX_IMPORT_ROWS) return fail(`Import at most ${MAX_IMPORT_ROWS} rows at a time; this file has ${rows.length}.`);
  try {
    const ws = await loadAccount(slug, accountId);
    if (!ws) return fail("That account no longer exists.");
    const all = await accountPolicies(ws.id, accountId);
    const results = validateImportRows(rows, { asOf: ws.asOfDate, existingClaimNumbers: await existingNumbers(ws.id, accountId) }).value;

    const skipped: ImportResult["skipped"] = [];
    const toInsert: (typeof claims.$inferInsert)[] = [];
    for (const r of results) {
      if (!r.valid || !r.parsed) {
        skipped.push({ row: r.row, claimNumber: r.raw.claim_number ?? "", reasons: r.reasons });
        continue;
      }
      if (r.warnings.includes("closed with a reserve") && !confirmClosedWithReserve) {
        skipped.push({ row: r.row, claimNumber: r.parsed.claimNumber, reasons: ["closed with a reserve, not confirmed"] });
        continue;
      }
      const p = r.parsed;
      toInsert.push({
        workspaceId: ws.id,
        accountId,
        policyId: resolvePolicyLink(all, p.lineOfBusiness, p.dateOfLoss, null).policyId,
        lineOfBusiness: p.lineOfBusiness,
        claimNumber: p.claimNumber,
        dateOfLoss: p.dateOfLoss,
        dateReported: p.dateReported,
        description: p.description,
        paid: p.paid,
        reserved: p.reserved,
        status: p.status,
      });
    }
    if (toInsert.length > 0) {
      await withTransaction(async (tx) => {
        await tx.insert(claims).values(toInsert);
      });
    }
    revalidatePath(`/w/${slug}`, "layout");
    return ok({ imported: toInsert.length, total: rows.length, skipped });
  } catch (err) {
    return fail(describeFailure("importing the claims", err));
  }
}
