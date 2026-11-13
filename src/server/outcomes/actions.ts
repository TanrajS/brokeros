"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { LOST_REASON_LABELS, isClosedRenewalStatus, type OutcomeType } from "@/lib/constants";
import { checkUndoOutcome, planSuccessorTerm } from "@/lib/domain/renewals";
import { formatCurrency } from "@/lib/format";
import {
  lostOutcomeSchema,
  nonRenewedOutcomeSchema,
  renewedOutcomeSchema,
  type LostOutcomeInput,
  type NonRenewedOutcomeInput,
  type RenewedOutcomeInput,
} from "@/lib/schemas/outcome";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult } from "@/server/actionResult";
import { getDb } from "@/server/db/client";
import { claims, policies, renewalOutcomes, type Policy, type Workspace } from "@/server/db/schema";
import { withTransaction, type Executor } from "@/server/db/tx";
import { logActivities, policyLabel } from "@/server/renewals/activityLog";
import { syncStages } from "@/server/renewals/stages";
import { getWorkspaceBySlug } from "@/server/workspace/queries";

/** A refusal that should reach the user as-is, thrown inside a transaction to roll it back. */
class OutcomeRefused extends Error {}

async function loadPolicy(slug: string, policyId: string): Promise<{ ws: Workspace; policy: Policy } | null> {
  const ws = await getWorkspaceBySlug(slug);
  if (!ws) return null;
  const policy = await getDb().query.policies.findFirst({ where: and(eq(policies.id, policyId), eq(policies.workspaceId, ws.id)) });
  return policy ? { ws, policy } : null;
}

/** Locks the policy row and confirms it is still open with no outcome. */
async function lockOpenPolicy(tx: Executor, ws: Workspace, policyId: string): Promise<Policy> {
  const [locked] = await tx
    .select()
    .from(policies)
    .where(and(eq(policies.id, policyId), eq(policies.workspaceId, ws.id)))
    .for("update");
  if (!locked) throw new OutcomeRefused("That policy no longer exists.");
  const existing = await tx.select({ id: renewalOutcomes.id }).from(renewalOutcomes).where(eq(renewalOutcomes.policyId, policyId));
  if (existing.length > 0 || isClosedRenewalStatus(locked.renewalStatus)) {
    throw new OutcomeRefused("This policy already has an outcome. Undo it first to record a different one.");
  }
  return locked;
}

async function finish(
  slug: string,
  ws: Workspace,
  policy: Policy,
  outcome: OutcomeType,
  write: (tx: Executor, locked: Policy) => Promise<{ successorId: string | null; body: string; reason: string | null; lostReason: LostOutcomeInput["lostReason"] | null; competingPremium: number | null }>,
): Promise<ActionResult<{ successorId: string | null }>> {
  try {
    const successorId = await withTransaction(async (tx) => {
      const locked = await lockOpenPolicy(tx, ws, policy.id);
      const r = await write(tx, locked);
      await tx
        .update(policies)
        .set({ renewalStatus: outcome, updatedAt: new Date() })
        .where(eq(policies.id, locked.id));
      await tx.insert(renewalOutcomes).values({
        workspaceId: ws.id,
        policyId: locked.id,
        outcome,
        lostReason: r.lostReason || null,
        reason: r.reason,
        competingPremium: r.competingPremium,
        successorPolicyId: r.successorId,
        priorStatus: locked.renewalStatus,
        recordedAsOf: ws.asOfDate,
      });
      await logActivities(tx, [
        { workspaceId: ws.id, accountId: locked.accountId, policyId: locked.id, kind: "outcome_recorded", body: r.body, asOfDate: ws.asOfDate },
      ]);
      await syncStages(tx, ws.id, ws.asOfDate, [locked.id, ...(r.successorId ? [r.successorId] : [])]);
      return r.successorId;
    });
    revalidatePath(`/w/${slug}`, "layout");
    return ok({ successorId });
  } catch (err) {
    if (err instanceof OutcomeRefused) return fail(err.message);
    return fail(describeFailure("recording the outcome", err));
  }
}

/**
 * Renewed: creates the successor policy (effective = old expiry, expiry = old
 * expiry + 12 months, previous_policy_id = old id, status not_started) and marks
 * the old policy renewed, in one transaction.
 */
export async function recordRenewedOutcome(slug: string, policyId: string, input: RenewedOutcomeInput): Promise<ActionResult<{ successorId: string | null }>> {
  let ctx;
  try {
    ctx = await loadPolicy(slug, policyId);
  } catch (err) {
    return fail(describeFailure("recording the outcome", err));
  }
  if (!ctx) return fail("That policy no longer exists.");
  const { ws, policy } = ctx;
  const schema = renewedOutcomeSchema({ occurrenceLimit: policy.occurrenceLimit !== null, aggregateLimit: policy.aggregateLimit !== null });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  const v = parsed.data;

  return finish(slug, ws, policy, "renewed", async (tx, old) => {
    const term = planSuccessorTerm(old.expiryDate).value;
    const [successor] = await tx
      .insert(policies)
      .values({
        workspaceId: ws.id,
        accountId: old.accountId,
        carrier: v.renewalCarrier,
        lineOfBusiness: old.lineOfBusiness,
        policyNumber: null,
        effectiveDate: term.effectiveDate,
        expiryDate: term.expiryDate,
        occurrenceLimit: v.renewalOccurrenceLimit,
        aggregateLimit: v.renewalAggregateLimit,
        deductible: v.renewalDeductible,
        annualPremium: v.renewalPremium,
        commissionRate: v.renewalCommissionRate,
        exposureBasis: old.exposureBasis,
        exposureAmount: v.renewalExposureAmount,
        endorsements: old.endorsements,
        renewalStatus: "not_started",
        previousPolicyId: old.id,
        notes: null,
      })
      .returning({ id: policies.id });
    return {
      successorId: successor.id,
      reason: null,
      lostReason: null,
      competingPremium: null,
      body: `Outcome recorded for ${policyLabel(old)}: renewed with ${v.renewalCarrier} at ${formatCurrency(v.renewalPremium)} (expiring ${formatCurrency(old.annualPremium)}), ${term.effectiveDate} to ${term.expiryDate}.`,
    };
  });
}

export async function recordLostOutcome(slug: string, policyId: string, input: LostOutcomeInput): Promise<ActionResult<{ successorId: string | null }>> {
  const parsed = lostOutcomeSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  let ctx;
  try {
    ctx = await loadPolicy(slug, policyId);
  } catch (err) {
    return fail(describeFailure("recording the outcome", err));
  }
  if (!ctx) return fail("That policy no longer exists.");
  const v = parsed.data;
  return finish(slug, ctx.ws, ctx.policy, "lost", async (_tx, old) => ({
    successorId: null,
    lostReason: v.lostReason,
    reason: v.details,
    competingPremium: v.competingPremium,
    body:
      `Outcome recorded for ${policyLabel(old)}: lost (${LOST_REASON_LABELS[v.lostReason]}).` +
      (v.competingPremium !== null ? ` Competing premium ${formatCurrency(v.competingPremium)} vs expiring ${formatCurrency(old.annualPremium)}.` : "") +
      (v.details ? ` ${v.details}` : ""),
  }));
}

export async function recordNonRenewedOutcome(slug: string, policyId: string, input: NonRenewedOutcomeInput): Promise<ActionResult<{ successorId: string | null }>> {
  const parsed = nonRenewedOutcomeSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  let ctx;
  try {
    ctx = await loadPolicy(slug, policyId);
  } catch (err) {
    return fail(describeFailure("recording the outcome", err));
  }
  if (!ctx) return fail("That policy no longer exists.");
  const v = parsed.data;
  return finish(slug, ctx.ws, ctx.policy, "non_renewed", async (_tx, old) => ({
    successorId: null,
    lostReason: null,
    reason: v.reason,
    competingPremium: null,
    body: `Outcome recorded for ${policyLabel(old)}: non-renewed by carrier. Reason: ${v.reason}`,
  }));
}

/**
 * Undo outcome: deletes the successor (refusing if it already has its own
 * outcome or claims), restores the prior renewal status, removes the outcome
 * and logs it, in one transaction.
 */
export async function undoOutcome(slug: string, policyId: string): Promise<ActionResult> {
  try {
    const ctx = await loadPolicy(slug, policyId);
    if (!ctx) return fail("That policy no longer exists.");
    const { ws } = ctx;
    await withTransaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(policies)
        .where(and(eq(policies.id, policyId), eq(policies.workspaceId, ws.id)))
        .for("update");
      if (!locked) throw new OutcomeRefused("That policy no longer exists.");
      const [outcome] = await tx.select().from(renewalOutcomes).where(eq(renewalOutcomes.policyId, policyId));
      if (!outcome) throw new OutcomeRefused("This policy has no outcome to undo.");

      let successorNote = "";
      if (outcome.successorPolicyId) {
        const [successor] = await tx.select().from(policies).where(eq(policies.id, outcome.successorPolicyId)).for("update");
        if (successor) {
          const own = await tx.select({ id: renewalOutcomes.id }).from(renewalOutcomes).where(eq(renewalOutcomes.policyId, successor.id));
          const successorClaims = await tx.select({ id: claims.id }).from(claims).where(eq(claims.policyId, successor.id));
          const check = checkUndoOutcome({ successorHasOutcome: own.length > 0, successorClaimCount: successorClaims.length }).value;
          if (!check.allowed) throw new OutcomeRefused(check.reason ?? "The renewal policy cannot be removed.");
          await tx.delete(policies).where(eq(policies.id, successor.id));
          successorNote = ` Removed the renewal policy with ${successor.carrier} (${successor.effectiveDate} to ${successor.expiryDate}).`;
        }
      }

      await tx.delete(renewalOutcomes).where(eq(renewalOutcomes.id, outcome.id));
      await tx
        .update(policies)
        .set({ renewalStatus: outcome.priorStatus, updatedAt: new Date() })
        .where(eq(policies.id, locked.id));
      await logActivities(tx, [
        {
          workspaceId: ws.id,
          accountId: locked.accountId,
          policyId: locked.id,
          kind: "outcome_undone",
          body: `Outcome undone for ${policyLabel(locked)}: was ${outcome.outcome.replace("_", "-")}, status restored to ${outcome.priorStatus.replace("_", " ")}.${successorNote}`,
          asOfDate: ws.asOfDate,
        },
      ]);
      await syncStages(tx, ws.id, ws.asOfDate, [locked.id]);
    });
    revalidatePath(`/w/${slug}`, "layout");
    return ok(undefined);
  } catch (err) {
    if (err instanceof OutcomeRefused) return fail(err.message);
    return fail(describeFailure("undoing the outcome", err));
  }
}
