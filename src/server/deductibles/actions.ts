"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { checkPartLimits, validateScheduleRows } from "@/lib/domain/deductibles";
import { deductibleFormSchema, type DeductibleFormInput } from "@/lib/schemas/deductible";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult } from "@/server/actionResult";
import { getDb } from "@/server/db/client";
import { policies, policyCoverageParts } from "@/server/db/schema";
import { withTransaction } from "@/server/db/tx";
import { getWorkspaceBySlug } from "@/server/workspace/queries";

function refresh(slug: string) {
  revalidatePath(`/w/${slug}`, "layout");
}

/**
 * Adds or edits a coverage part. Editing the default row keeps the policy's own
 * fields in step: its deductible must stay a flat amount, and that amount and
 * both limits are written back to the policy. A part limit above the policy's
 * headline limit is allowed and returned as a warning.
 */
export async function saveDeductible(slug: string, policyId: string, deductibleId: string | null, input: DeductibleFormInput): Promise<ActionResult<{ id: string; warnings: string[] }>> {
  const parsed = deductibleFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const policy = await db.query.policies.findFirst({ where: and(eq(policies.id, policyId), eq(policies.workspaceId, ws.id)) });
    if (!policy) return fail("That policy no longer exists.");
    const v = parsed.data;
    const rows = await db.select().from(policyCoverageParts).where(eq(policyCoverageParts.policyId, policyId));
    const existing = deductibleId ? (rows.find((r) => r.id === deductibleId) ?? null) : null;
    if (deductibleId && !existing) return fail("That coverage part no longer exists.");
    if (rows.some((r) => r.id !== deductibleId && r.appliesTo.trim().toLowerCase() === v.appliesTo.trim().toLowerCase())) {
      return fail("Please fix the highlighted fields.", { appliesTo: "This peril or coverage part already has a row on the policy" });
    }
    if (!existing && v.appliesTo.trim().toLowerCase() === "all other perils") {
      return fail("Please fix the highlighted fields.", { appliesTo: "All other perils is the policy's own deductible and limits; edit them on the policy or in the default row" });
    }
    if (existing?.isDefault && v.kind !== "flat") return fail("Please fix the highlighted fields.", { kind: "The default (all other perils) deductible must be a flat amount" });
    const warnings = existing?.isDefault ? [] : checkPartLimits({ appliesTo: v.appliesTo, occurrenceLimit: v.occurrenceLimit, aggregateLimit: v.aggregateLimit }, { occurrenceLimit: policy.occurrenceLimit, aggregateLimit: policy.aggregateLimit }).value.warnings;
    const values = { appliesTo: existing?.isDefault ? existing.appliesTo : v.appliesTo, kind: v.kind, amount: v.amount, percent: v.percent, minimum: v.minimum, maximum: v.maximum, hours: v.hours, occurrenceLimit: v.occurrenceLimit, aggregateLimit: v.aggregateLimit, notes: v.notes };
    const id = await withTransaction(async (tx) => {
      if (existing) {
        await tx.update(policyCoverageParts).set({ ...values, updatedAt: new Date() }).where(eq(policyCoverageParts.id, existing.id));
        if (existing.isDefault) await tx.update(policies).set({ deductible: v.amount, occurrenceLimit: v.occurrenceLimit, aggregateLimit: v.aggregateLimit, updatedAt: new Date() }).where(eq(policies.id, policyId));
        return existing.id;
      }
      const [row] = await tx.insert(policyCoverageParts).values({ workspaceId: ws.id, policyId, ...values, isDefault: false }).returning({ id: policyCoverageParts.id });
      return row.id;
    });
    refresh(slug);
    return ok({ id, warnings });
  } catch (err) {
    return fail(describeFailure("saving the coverage part", err));
  }
}

/** Removes a part. The default row cannot be deleted here: clear the policy's deductible and limits instead. */
export async function deleteDeductible(slug: string, deductibleId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const [row] = await db.select().from(policyCoverageParts).where(and(eq(policyCoverageParts.id, deductibleId), eq(policyCoverageParts.workspaceId, ws.id)));
    if (!row) return fail("That coverage part no longer exists.");
    if (row.isDefault) return fail("All other perils is the policy's own deductible and limits; clear them on the policy instead.");
    await db.delete(policyCoverageParts).where(eq(policyCoverageParts.id, deductibleId));
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("deleting the coverage part", err));
  }
}

export interface ScheduleImportResult {
  imported: number;
  total: number;
  skipped: { row: number; appliesTo: string; reasons: string[] }[];
  /** Parts imported with a limit above the policy's headline limit. */
  warnings: string[];
}

/** Imports coverage parts for one policy in one transaction; rows whose peril already has a part are skipped. */
export async function importDeductibleSchedule(slug: string, policyId: string, rows: Record<string, string>[]): Promise<ActionResult<ScheduleImportResult>> {
  if (!Array.isArray(rows) || rows.length === 0) return fail("The file has no rows to import.");
  if (rows.length > 200) return fail(`Import at most 200 rows at a time; this file has ${rows.length}.`);
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const policy = await db.query.policies.findFirst({ where: and(eq(policies.id, policyId), eq(policies.workspaceId, ws.id)) });
    if (!policy) return fail("That policy no longer exists.");
    const existing = await db.select({ appliesTo: policyCoverageParts.appliesTo }).from(policyCoverageParts).where(eq(policyCoverageParts.policyId, policyId));
    const results = validateScheduleRows(rows, { existingAppliesTo: existing.map((e) => e.appliesTo), headline: { occurrenceLimit: policy.occurrenceLimit, aggregateLimit: policy.aggregateLimit } }).value;
    const skipped: ScheduleImportResult["skipped"] = [];
    const warnings: string[] = [];
    const toInsert: (typeof policyCoverageParts.$inferInsert)[] = [];
    for (const r of results) {
      if (!r.valid || !r.parsed) {
        skipped.push({ row: r.row, appliesTo: r.raw.applies_to ?? "", reasons: r.reasons });
        continue;
      }
      warnings.push(...r.warnings.filter((w) => /above the policy's/.test(w)));
      toInsert.push({ workspaceId: ws.id, policyId, ...r.parsed, isDefault: false });
    }
    if (toInsert.length > 0) {
      await withTransaction(async (tx) => {
        await tx.insert(policyCoverageParts).values(toInsert);
      });
    }
    refresh(slug);
    return ok({ imported: toInsert.length, total: rows.length, skipped, warnings });
  } catch (err) {
    return fail(describeFailure("importing the coverage schedule", err));
  }
}
