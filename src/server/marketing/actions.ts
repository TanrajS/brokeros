"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { SubmissionStatus } from "@/lib/constants";
import { canRecordQuote, checkTransition, isQuoteExpired } from "@/lib/domain/marketing";
import {
  declineFormSchema,
  quoteFormSchema,
  submissionFormSchema,
  type DeclineFormInput,
  type QuoteFormInput,
  type SubmissionFormInput,
} from "@/lib/schemas/marketing";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult } from "@/server/actionResult";
import { getDb } from "@/server/db/client";
import { policies, quotes, renewalOutcomes, submissions, type Submission, type Workspace } from "@/server/db/schema";
import { withTransaction, type Executor } from "@/server/db/tx";
import { getWorkspaceBySlug } from "@/server/workspace/queries";

/** A refusal to show as-is, thrown inside a transaction to roll it back. */
class Refused extends Error {}

function refresh(slug: string) {
  revalidatePath(`/w/${slug}`, "layout");
}

async function loadSubmission(db: Executor, ws: Workspace, submissionId: string): Promise<Submission | null> {
  const [row] = await db.select().from(submissions).where(and(eq(submissions.id, submissionId), eq(submissions.workspaceId, ws.id)));
  return row ?? null;
}

async function transitionContext(db: Executor, s: Submission, ws: Workspace, quoteExpired = false) {
  const [quoteRows, otherBound, outcome] = await Promise.all([
    db.select({ id: quotes.id }).from(quotes).where(eq(quotes.submissionId, s.id)),
    db.select({ id: submissions.id }).from(submissions).where(and(eq(submissions.policyId, s.policyId), eq(submissions.status, "bound"), ne(submissions.id, s.id))),
    db.select({ id: renewalOutcomes.id }).from(renewalOutcomes).where(eq(renewalOutcomes.policyId, s.policyId)),
  ]);
  return {
    hasSentOn: s.sentOn !== null && s.sentOn <= ws.asOfDate,
    quoteCount: quoteRows.length,
    otherBound: otherBound.length > 0,
    policyHasOutcome: outcome.length > 0,
    quoteExpired,
  };
}

/* ---------- Submissions ---------- */

export async function createSubmission(slug: string, policyId: string, input: SubmissionFormInput): Promise<ActionResult<{ id: string }>> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const parsed = submissionFormSchema(ws.asOfDate).safeParse(input);
    if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
    const db = getDb();
    const policy = await db.query.policies.findFirst({ where: and(eq(policies.id, policyId), eq(policies.workspaceId, ws.id)) });
    if (!policy) return fail("That policy no longer exists.");
    const v = parsed.data;
    const [row] = await db
      .insert(submissions)
      .values({ workspaceId: ws.id, accountId: policy.accountId, policyId, carrier: v.carrier, sentOn: v.sentOn, notes: v.notes, status: v.sentOn ? "submitted" : "planned" })
      .returning({ id: submissions.id });
    refresh(slug);
    return ok({ id: row.id });
  } catch (err) {
    return fail(describeFailure("adding the carrier", err));
  }
}

/** Edits carrier, sent date and notes. Status changes go through the explicit actions below. */
export async function updateSubmission(slug: string, submissionId: string, input: SubmissionFormInput): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const parsed = submissionFormSchema(ws.asOfDate).safeParse(input);
    if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
    const db = getDb();
    const s = await loadSubmission(db, ws, submissionId);
    if (!s) return fail("That submission no longer exists.");
    if (s.status !== "planned" && parsed.data.sentOn === null) return fail("Please fix the highlighted fields.", { sentOn: "A submission that has been sent keeps its sent date" });
    await db.update(submissions).set({ ...parsed.data, updatedAt: new Date() }).where(eq(submissions.id, submissionId));
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("saving the submission", err));
  }
}

/** submitted (from planned, no response or declined) and no_response. */
export async function setSubmissionStatus(slug: string, submissionId: string, to: Extract<SubmissionStatus, "submitted" | "no_response">): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const s = await loadSubmission(db, ws, submissionId);
    if (!s) return fail("That submission no longer exists.");
    const check = checkTransition(s.status, to, await transitionContext(db, s, ws)).value;
    if (!check.allowed) return fail(check.reason ?? "That change is not allowed.");
    // Reopening clears a decline; marking no response leaves the response date empty.
    await db
      .update(submissions)
      .set({ status: to, ...(to === "submitted" ? { declinedReason: null, respondedOn: null } : {}), updatedAt: new Date() })
      .where(eq(submissions.id, submissionId));
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("updating the submission", err));
  }
}

export async function declineSubmission(slug: string, submissionId: string, input: DeclineFormInput): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const parsed = declineFormSchema(ws.asOfDate).safeParse(input);
    if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
    const db = getDb();
    const s = await loadSubmission(db, ws, submissionId);
    if (!s) return fail("That submission no longer exists.");
    const check = checkTransition(s.status, "declined", await transitionContext(db, s, ws)).value;
    if (!check.allowed) return fail(check.reason ?? "That change is not allowed.");
    if (s.sentOn && parsed.data.respondedOn < s.sentOn) return fail("Please fix the highlighted fields.", { respondedOn: "The decline cannot be before the submission was sent" });
    await db
      .update(submissions)
      .set({ status: "declined", declinedReason: parsed.data.declinedReason, respondedOn: parsed.data.respondedOn, notes: parsed.data.notes ?? s.notes, updatedAt: new Date() })
      .where(eq(submissions.id, submissionId));
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("recording the decline", err));
  }
}

export async function deleteSubmission(slug: string, submissionId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const s = await loadSubmission(db, ws, submissionId);
    if (!s) return fail("That submission no longer exists.");
    if (s.status === "bound") return fail("Unbind this carrier before removing it.");
    await db.delete(submissions).where(eq(submissions.id, submissionId));
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("removing the submission", err));
  }
}

/* ---------- Quotes ---------- */

export async function saveQuote(slug: string, submissionId: string, quoteId: string | null, input: QuoteFormInput): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const parsed = quoteFormSchema(ws.asOfDate).safeParse(input);
    if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
    const { respondedOn, ...v } = parsed.data;
    await withTransaction(async (tx) => {
      const [s] = await tx.select().from(submissions).where(and(eq(submissions.id, submissionId), eq(submissions.workspaceId, ws.id))).for("update");
      if (!s) throw new Refused("That submission no longer exists.");
      if (quoteId) {
        const updated = await tx
          .update(quotes)
          .set({ ...v, updatedAt: new Date() })
          .where(and(eq(quotes.id, quoteId), eq(quotes.submissionId, submissionId)))
          .returning({ id: quotes.id, isBound: quotes.isBound });
        if (updated.length === 0) throw new Refused("That quote no longer exists.");
        return;
      }
      const allowed = canRecordQuote(s.status).value;
      if (!allowed.allowed) throw new Refused(allowed.reason ?? "A quote cannot be recorded here.");
      if (s.sentOn && respondedOn < s.sentOn) throw new Refused("The quote date cannot be before the submission was sent.");
      await tx.insert(quotes).values({ workspaceId: ws.id, submissionId, ...v });
      await tx
        .update(submissions)
        .set({ status: "quoted", respondedOn: s.respondedOn ?? respondedOn, updatedAt: new Date() })
        .where(eq(submissions.id, submissionId));
    });
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    if (err instanceof Refused) return fail(err.message);
    return fail(describeFailure("saving the quote", err));
  }
}

export async function deleteQuote(slug: string, quoteId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    await withTransaction(async (tx) => {
      const [q] = await tx.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.workspaceId, ws.id)));
      if (!q) throw new Refused("That quote no longer exists.");
      if (q.isBound) throw new Refused("Unbind this quote before removing it.");
      await tx.delete(quotes).where(eq(quotes.id, quoteId));
      const remaining = await tx.select({ id: quotes.id }).from(quotes).where(eq(quotes.submissionId, q.submissionId));
      // Last quote gone: the submission is back to waiting for a response.
      if (remaining.length === 0) await tx.update(submissions).set({ status: "submitted", respondedOn: null, updatedAt: new Date() }).where(and(eq(submissions.id, q.submissionId), eq(submissions.status, "quoted")));
    });
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    if (err instanceof Refused) return fail(err.message);
    return fail(describeFailure("removing the quote", err));
  }
}

/* ---------- Bind ---------- */

/**
 * Binds one quote. In one transaction: lock the policy, check the domain rule
 * (one bound submission per policy, quote not expired, no outcome yet), mark the
 * quote bound and the submission bound. The caller then opens the Renewed
 * outcome form prefilled with this quote.
 */
export async function bindQuote(slug: string, quoteId: string): Promise<ActionResult<{ policyUrl: string }>> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const policyUrl = await withTransaction(async (tx) => {
      const [q] = await tx.select().from(quotes).where(and(eq(quotes.id, quoteId), eq(quotes.workspaceId, ws.id)));
      if (!q) throw new Refused("That quote no longer exists.");
      const s = await loadSubmission(tx, ws, q.submissionId);
      if (!s) throw new Refused("That submission no longer exists.");
      const [policy] = await tx.select().from(policies).where(eq(policies.id, s.policyId)).for("update");
      if (!policy) throw new Refused("That policy no longer exists.");
      const check = checkTransition(s.status, "bound", await transitionContext(tx, s, ws, isQuoteExpired(q.validUntil, ws.asOfDate).value)).value;
      if (!check.allowed) throw new Refused(check.reason ?? "This quote cannot be bound.");
      await tx.update(quotes).set({ isBound: true, updatedAt: new Date() }).where(eq(quotes.id, q.id));
      await tx.update(submissions).set({ status: "bound", updatedAt: new Date() }).where(eq(submissions.id, s.id));
      return `/w/${slug}/accounts/${policy.accountId}/policies/${policy.id}?outcome=renewed`;
    });
    refresh(slug);
    return ok({ policyUrl });
  } catch (err) {
    if (err instanceof Refused) return fail(err.message);
    return fail(describeFailure("binding the quote", err));
  }
}

export async function unbindSubmission(slug: string, submissionId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    await withTransaction(async (tx) => {
      const s = await loadSubmission(tx, ws, submissionId);
      if (!s) throw new Refused("That submission no longer exists.");
      const check = checkTransition(s.status, "quoted", await transitionContext(tx, s, ws)).value;
      if (!check.allowed) throw new Refused(check.reason ?? "This submission cannot be unbound.");
      await tx.update(quotes).set({ isBound: false, updatedAt: new Date() }).where(eq(quotes.submissionId, s.id));
      await tx.update(submissions).set({ status: "quoted", updatedAt: new Date() }).where(eq(submissions.id, s.id));
    });
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    if (err instanceof Refused) return fail(err.message);
    return fail(describeFailure("unbinding", err));
  }
}
