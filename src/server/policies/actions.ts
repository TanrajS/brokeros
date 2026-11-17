"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/server/db/client";
import { accounts, policies, renewalOutcomes } from "@/server/db/schema";
import { getExecutor } from "@/server/db/tx";
import { syncStages } from "@/server/renewals/stages";
import { isClosedRenewalStatus } from "@/lib/constants";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult, type FieldErrors } from "@/server/actionResult";
import { syncDefaultCoveragePart } from "@/server/deductibles/sync";
import { nameConflict } from "@/lib/domain/book";
import { getWorkspaceBySlug } from "@/server/workspace/queries";
import { policyFormSchema, type PolicyFormInput, type PolicyFormValues } from "@/lib/schemas/policy";

/** A previous policy must belong to the same account and must not be the policy itself. */
async function validatePreviousPolicy(
  workspaceId: string,
  accountId: string,
  values: PolicyFormValues,
  selfId: string | null,
): Promise<FieldErrors | null> {
  if (!values.previousPolicyId) return null;
  if (values.previousPolicyId === selfId) return { previousPolicyId: "A policy cannot be its own previous policy" };
  const db = getDb();
  const prev = await db.query.policies.findFirst({
    where: and(eq(policies.id, values.previousPolicyId), eq(policies.workspaceId, workspaceId), eq(policies.accountId, accountId)),
  });
  if (!prev) return { previousPolicyId: "Choose a policy from the same account" };
  return null;
}

const CLOSED_STATUS_ERROR = { renewalStatus: "Renewed, lost and non-renewed are set by recording an outcome on the policy page" };

/** v1.5.1: a policy number is unique within its account (case-insensitive, trimmed); blanks are free. */
async function policyNumberError(accountId: string, policyNumber: string | null, excludeId: string | null): Promise<Record<string, string> | null> {
  if (!policyNumber || !policyNumber.trim()) return null;
  const rows = await getDb().select({ id: policies.id, name: policies.policyNumber }).from(policies).where(eq(policies.accountId, accountId));
  const hit = nameConflict(policyNumber, rows.filter((r): r is { id: string; name: string } => r.name !== null), excludeId).value;
  return hit ? { policyNumber: `Policy number ${policyNumber.trim()} is already used on this account` } : null;
}

/** Called on blur from the policy form so the duplicate message appears before Save. */
export async function checkPolicyNumber(slug: string, accountId: string, policyNumber: string, excludePolicyId: string | null): Promise<ActionResult<{ error: string | null }>> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const owner = await getDb().query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) });
    if (!owner) return fail("That account no longer exists.");
    const err = await policyNumberError(accountId, policyNumber, excludePolicyId);
    return ok({ error: err?.policyNumber ?? null });
  } catch (err) {
    return fail(describeFailure("checking the policy number", err));
  }
}

const isUniqueViolation = (err: unknown) => err instanceof Error && /unique|duplicate key/i.test(err.message);

export async function createPolicy(slug: string, accountId: string, input: PolicyFormInput): Promise<ActionResult<{ id: string }>> {
  const parsed = policyFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const owner = await db.query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) });
    if (!owner) return fail("That account no longer exists.");
    if (isClosedRenewalStatus(parsed.data.renewalStatus)) return fail("Please fix the highlighted fields.", CLOSED_STATUS_ERROR);
    const prevErrors = await validatePreviousPolicy(ws.id, accountId, parsed.data, null);
    if (prevErrors) return fail("Please fix the highlighted fields.", prevErrors);
    const numberError = await policyNumberError(accountId, parsed.data.policyNumber, null);
    if (numberError) return fail("Please fix the highlighted fields.", numberError);
    const [row] = await db
      .insert(policies)
      .values({ workspaceId: ws.id, accountId, ...parsed.data })
      .returning({ id: policies.id });
    await syncDefaultCoveragePart(getExecutor(), ws.id, row.id, { deductible: parsed.data.deductible, occurrenceLimit: parsed.data.occurrenceLimit, aggregateLimit: parsed.data.aggregateLimit });
    await syncStages(getExecutor(), ws.id, ws.asOfDate, [row.id]);
    revalidatePath(`/w/${slug}`, "layout");
    return ok({ id: row.id });
  } catch (err) {
    if (isUniqueViolation(err)) return fail("Please fix the highlighted fields.", { policyNumber: `Policy number ${parsed.data.policyNumber ?? ""} is already used on this account` });
    return fail(describeFailure("adding the policy", err));
  }
}

export async function updatePolicy(slug: string, policyId: string, input: PolicyFormInput): Promise<ActionResult> {
  const parsed = policyFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const existing = await db.query.policies.findFirst({ where: and(eq(policies.id, policyId), eq(policies.workspaceId, ws.id)) });
    if (!existing) return fail("That policy no longer exists.");
    const prevErrors = await validatePreviousPolicy(ws.id, existing.accountId, parsed.data, policyId);
    if (prevErrors) return fail("Please fix the highlighted fields.", prevErrors);
    const numberError = await policyNumberError(existing.accountId, parsed.data.policyNumber, policyId);
    if (numberError) return fail("Please fix the highlighted fields.", numberError);
    // Outcomes are immutable except through Undo: once one exists, the status is locked to it.
    const outcome = await db.query.renewalOutcomes.findFirst({ where: eq(renewalOutcomes.policyId, policyId) });
    const locked = outcome !== undefined || isClosedRenewalStatus(existing.renewalStatus);
    if (!locked && isClosedRenewalStatus(parsed.data.renewalStatus)) return fail("Please fix the highlighted fields.", CLOSED_STATUS_ERROR);
    const renewalStatus = locked ? existing.renewalStatus : parsed.data.renewalStatus;
    await db
      .update(policies)
      .set({ ...parsed.data, renewalStatus, updatedAt: new Date() })
      .where(eq(policies.id, policyId));
    await syncDefaultCoveragePart(getExecutor(), ws.id, policyId, { deductible: parsed.data.deductible, occurrenceLimit: parsed.data.occurrenceLimit, aggregateLimit: parsed.data.aggregateLimit });
    await syncStages(getExecutor(), ws.id, ws.asOfDate, [policyId]);
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    if (isUniqueViolation(err)) return fail("Please fix the highlighted fields.", { policyNumber: `Policy number ${parsed.data.policyNumber ?? ""} is already used on this account` });
    return fail(describeFailure("saving the policy", err));
  }
}

export async function deletePolicy(slug: string, policyId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    await db.delete(policies).where(and(eq(policies.id, policyId), eq(policies.workspaceId, ws.id)));
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("deleting the policy", err));
  }
}
