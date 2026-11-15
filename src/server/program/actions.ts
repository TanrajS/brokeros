"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { LINE_GROUPS, LINE_GROUP_PRIMARY, validatePlacementRows, type LineGroup } from "@/lib/domain/program";
import {
  certificateFormSchema,
  layerFormSchema,
  participantFormSchema,
  participationFormSchema,
  requirementFormSchema,
  sublimitFormSchema,
  towerLayerFormSchema,
  type CertificateFormInput,
  type LayerFormInput,
  type ParticipantFormInput,
  type ParticipationFormInput,
  type RequirementFormInput,
  type SublimitFormInput,
  type TowerLayerFormInput,
} from "@/lib/schemas/program";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult } from "@/server/actionResult";
import { getDb } from "@/server/db/client";
import { accounts, certificates, contractRequirements, layerParticipations, policies, policyParticipants, policySublimits, programLayers, type Workspace } from "@/server/db/schema";
import { withTransaction, type Executor } from "@/server/db/tx";
import { getWorkspaceBySlug } from "@/server/workspace/queries";

/** A refusal to show as-is, thrown inside a transaction to roll it back. */
class Refused extends Error {}

async function loadAccount(slug: string, accountId: string): Promise<Workspace | null> {
  const ws = await getWorkspaceBySlug(slug);
  if (!ws) return null;
  const account = await getDb().query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) });
  return account ? ws : null;
}

function refresh(slug: string) {
  revalidatePath(`/w/${slug}`, "layout");
}

/* ---------- Program layers and participations (v1.3) ---------- */

async function checkLayerPolicy(workspaceId: string, accountId: string, lineGroup: LineGroup, policyId: string | null): Promise<string | null> {
  if (!policyId) return null;
  const p = await getDb().query.policies.findFirst({ where: and(eq(policies.id, policyId), eq(policies.workspaceId, workspaceId), eq(policies.accountId, accountId)) });
  if (!p) return "Choose a policy on this account";
  if (p.lineOfBusiness !== LINE_GROUP_PRIMARY[lineGroup] && p.lineOfBusiness !== "Umbrella/Excess" && p.lineOfBusiness !== "Property") return `Choose a ${LINE_GROUP_PRIMARY[lineGroup]}, Property or Umbrella/Excess policy`;
  return null;
}

async function loadLayer(db: Executor, workspaceId: string, layerId: string) {
  const [row] = await db.select().from(programLayers).where(and(eq(programLayers.id, layerId), eq(programLayers.workspaceId, workspaceId)));
  return row ?? null;
}

/**
 * The simple (v0.5) form: one insurer at 100%. Creates the layer with a single
 * participation, or updates the layer and its sole participation. A layer with
 * several insurers is edited in the advanced view.
 */
export async function saveTowerLayer(slug: string, accountId: string, layerId: string | null, input: TowerLayerFormInput): Promise<ActionResult<{ id: string }>> {
  const parsed = towerLayerFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await loadAccount(slug, accountId);
    if (!ws) return fail("That account no longer exists.");
    const v = parsed.data;
    const policyError = await checkLayerPolicy(ws.id, accountId, v.lineGroup, v.policyId);
    if (policyError) return fail("Please fix the highlighted fields.", { policyId: policyError });
    const id = await withTransaction(async (tx) => {
      if (layerId) {
        const existing = await loadLayer(tx, ws.id, layerId);
        if (!existing || existing.accountId !== accountId) throw new Refused("That layer no longer exists.");
        const parts = await tx.select().from(layerParticipations).where(eq(layerParticipations.layerId, layerId));
        if (parts.length > 1) throw new Refused("This layer has several insurers; edit it in the Advanced view.");
        await tx.update(programLayers).set({ lineGroup: v.lineGroup, layerType: v.layerType, attachment: v.attachment, limit: v.limit, policyId: v.policyId, updatedAt: new Date() }).where(eq(programLayers.id, layerId));
        if (parts.length === 1) await tx.update(layerParticipations).set({ insurer: v.carrier, premium: v.premium, signedLinePct: 100, isLead: true, updatedAt: new Date() }).where(eq(layerParticipations.id, parts[0].id));
        else await tx.insert(layerParticipations).values({ workspaceId: ws.id, layerId, insurer: v.carrier, writtenLinePct: null, signedLinePct: 100, premium: v.premium, isLead: true });
        return layerId;
      }
      const [row] = await tx
        .insert(programLayers)
        .values({ workspaceId: ws.id, accountId, lineGroup: v.lineGroup, towerLabel: "Tower 1", layerType: v.layerType, attachment: v.attachment, limit: v.limit, basis: "per_occurrence", policyId: v.policyId })
        .returning({ id: programLayers.id });
      await tx.insert(layerParticipations).values({ workspaceId: ws.id, layerId: row.id, insurer: v.carrier, writtenLinePct: null, signedLinePct: 100, premium: v.premium, isLead: true });
      return row.id;
    });
    refresh(slug);
    return ok({ id });
  } catch (err) {
    if (err instanceof Refused) return fail(err.message);
    return fail(describeFailure("saving the layer", err));
  }
}

/** Advanced view: the layer itself (tower, type, attachment, limit, basis); insurers are participations. */
export async function saveLayer(slug: string, accountId: string, layerId: string | null, input: LayerFormInput): Promise<ActionResult<{ id: string }>> {
  const parsed = layerFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await loadAccount(slug, accountId);
    if (!ws) return fail("That account no longer exists.");
    const v = parsed.data;
    const policyError = await checkLayerPolicy(ws.id, accountId, v.lineGroup, v.policyId);
    if (policyError) return fail("Please fix the highlighted fields.", { policyId: policyError });
    const db = getDb();
    const values = { lineGroup: v.lineGroup, towerLabel: v.towerLabel, layerType: v.layerType, attachment: v.attachment, limit: v.limit, basis: v.basis, policyId: v.policyId, notes: v.notes };
    if (layerId) {
      const updated = await db.update(programLayers).set({ ...values, updatedAt: new Date() }).where(and(eq(programLayers.id, layerId), eq(programLayers.workspaceId, ws.id), eq(programLayers.accountId, accountId))).returning({ id: programLayers.id });
      if (updated.length === 0) return fail("That layer no longer exists.");
      refresh(slug);
      return ok({ id: layerId });
    }
    const [row] = await db.insert(programLayers).values({ workspaceId: ws.id, accountId, ...values }).returning({ id: programLayers.id });
    refresh(slug);
    return ok({ id: row.id });
  } catch (err) {
    return fail(describeFailure("saving the layer", err));
  }
}

export async function deleteTowerLayer(slug: string, layerId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    await getDb().delete(programLayers).where(and(eq(programLayers.id, layerId), eq(programLayers.workspaceId, ws.id)));
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("deleting the layer", err));
  }
}

export async function saveParticipation(slug: string, layerId: string, participationId: string | null, input: ParticipationFormInput): Promise<ActionResult<{ id: string }>> {
  const parsed = participationFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const db = getDb();
    const layer = await loadLayer(db, ws.id, layerId);
    if (!layer) return fail("That layer no longer exists.");
    const v = parsed.data;
    const others = await db.select({ id: layerParticipations.id, insurer: layerParticipations.insurer }).from(layerParticipations).where(eq(layerParticipations.layerId, layerId));
    if (others.some((o) => o.id !== participationId && o.insurer.trim().toLowerCase() === v.insurer.trim().toLowerCase())) {
      return fail("Please fix the highlighted fields.", { insurer: "This insurer is already on the layer" });
    }
    const values = { insurer: v.insurer, writtenLinePct: v.writtenLinePct, signedLinePct: v.signedLinePct, premium: v.premium, policyNumber: v.policyNumber, isLead: v.isLead, notes: v.notes };
    const id = await withTransaction(async (tx) => {
      if (v.isLead) await tx.update(layerParticipations).set({ isLead: false }).where(eq(layerParticipations.layerId, layerId));
      if (participationId) {
        const updated = await tx.update(layerParticipations).set({ ...values, updatedAt: new Date() }).where(and(eq(layerParticipations.id, participationId), eq(layerParticipations.layerId, layerId))).returning({ id: layerParticipations.id });
        if (updated.length === 0) throw new Refused("That insurer line no longer exists.");
        return participationId;
      }
      const [row] = await tx.insert(layerParticipations).values({ workspaceId: ws.id, layerId, ...values }).returning({ id: layerParticipations.id });
      return row.id;
    });
    refresh(slug);
    return ok({ id });
  } catch (err) {
    if (err instanceof Refused) return fail(err.message);
    return fail(describeFailure("saving the insurer line", err));
  }
}

export async function deleteParticipation(slug: string, participationId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    await getDb().delete(layerParticipations).where(and(eq(layerParticipations.id, participationId), eq(layerParticipations.workspaceId, ws.id)));
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("removing the insurer line", err));
  }
}

export interface PlacementImportResult {
  layersCreated: number;
  participationsAdded: number;
  total: number;
  skipped: { row: number; insurer: string; reasons: string[] }[];
}

/**
 * Imports a placement schedule into a line group. Rows that describe the same
 * tower, type, attachment and limit share one layer (existing or new); each row
 * adds one participation. All inserts run in one transaction.
 */
export async function importPlacementSchedule(slug: string, accountId: string, lineGroup: LineGroup, rows: Record<string, string>[]): Promise<ActionResult<PlacementImportResult>> {
  if (!Array.isArray(rows) || rows.length === 0) return fail("The file has no rows to import.");
  if (rows.length > 500) return fail(`Import at most 500 rows at a time; this file has ${rows.length}.`);
  if (!LINE_GROUPS.includes(lineGroup)) return fail("Choose a line group.");
  try {
    const ws = await loadAccount(slug, accountId);
    if (!ws) return fail("That account no longer exists.");
    const results = validatePlacementRows(rows).value;
    const skipped: PlacementImportResult["skipped"] = [];
    const valid = results.filter((r) => {
      if (r.valid && r.parsed) return true;
      skipped.push({ row: r.row, insurer: r.raw.insurer ?? "", reasons: r.reasons });
      return false;
    });
    let layersCreated = 0;
    let participationsAdded = 0;
    if (valid.length > 0) {
      await withTransaction(async (tx) => {
        const existingLayers = await tx.select().from(programLayers).where(and(eq(programLayers.workspaceId, ws.id), eq(programLayers.accountId, accountId), eq(programLayers.lineGroup, lineGroup)));
        const existingParts = existingLayers.length ? await tx.select().from(layerParticipations).where(inArray(layerParticipations.layerId, existingLayers.map((l) => l.id))) : [];
        const layerIdFor = new Map<string, string>();
        const insurersIn = new Map<string, Set<string>>();
        const keyOf = (t: string, type: string, a: number, l: number) => `${t.toLowerCase()}|${type}|${a}|${l}`;
        for (const l of existingLayers) {
          layerIdFor.set(keyOf(l.towerLabel, l.layerType, l.attachment, l.limit), l.id);
          insurersIn.set(l.id, new Set(existingParts.filter((p) => p.layerId === l.id).map((p) => p.insurer.toLowerCase())));
        }
        for (const r of valid) {
          const p = r.parsed!;
          const key = keyOf(p.towerLabel, p.layerType, p.attachment, p.limit);
          let layerId = layerIdFor.get(key);
          if (!layerId) {
            const [row] = await tx
              .insert(programLayers)
              .values({ workspaceId: ws.id, accountId, lineGroup, towerLabel: p.towerLabel, layerType: p.layerType, attachment: p.attachment, limit: p.limit, basis: "per_occurrence" })
              .returning({ id: programLayers.id });
            layerId = row.id;
            layerIdFor.set(key, layerId);
            insurersIn.set(layerId, new Set());
            layersCreated += 1;
          }
          const seen = insurersIn.get(layerId)!;
          if (seen.has(p.insurer.toLowerCase())) {
            skipped.push({ row: r.row, insurer: p.insurer, reasons: ["insurer already on this layer"] });
            continue;
          }
          seen.add(p.insurer.toLowerCase());
          await tx.insert(layerParticipations).values({ workspaceId: ws.id, layerId, insurer: p.insurer, writtenLinePct: p.writtenLinePct, signedLinePct: p.signedLinePct, premium: p.premium, policyNumber: p.policyNumber, isLead: seen.size === 1 });
          participationsAdded += 1;
        }
      });
    }
    refresh(slug);
    return ok({ layersCreated, participationsAdded, total: rows.length, skipped: skipped.sort((a, b) => a.row - b.row) });
  } catch (err) {
    return fail(describeFailure("importing the placement schedule", err));
  }
}

/* ---------- Contract requirements ---------- */

export async function saveRequirement(slug: string, accountId: string, requirementId: string | null, input: RequirementFormInput): Promise<ActionResult<{ id: string }>> {
  const parsed = requirementFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await loadAccount(slug, accountId);
    if (!ws) return fail("That account no longer exists.");
    const db = getDb();
    if (requirementId) {
      const updated = await db
        .update(contractRequirements)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(contractRequirements.id, requirementId), eq(contractRequirements.workspaceId, ws.id), eq(contractRequirements.accountId, accountId)))
        .returning({ id: contractRequirements.id });
      if (updated.length === 0) return fail("That requirement no longer exists.");
      refresh(slug);
      return ok({ id: requirementId });
    }
    const [row] = await db.insert(contractRequirements).values({ workspaceId: ws.id, accountId, ...parsed.data }).returning({ id: contractRequirements.id });
    refresh(slug);
    return ok({ id: row.id });
  } catch (err) {
    return fail(describeFailure("saving the requirement", err));
  }
}

export async function deleteRequirement(slug: string, requirementId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    await getDb().delete(contractRequirements).where(and(eq(contractRequirements.id, requirementId), eq(contractRequirements.workspaceId, ws.id)));
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("deleting the requirement", err));
  }
}

/* ---------- Certificates ---------- */

export async function saveCertificate(slug: string, accountId: string, certificateId: string | null, input: CertificateFormInput): Promise<ActionResult<{ id: string }>> {
  try {
    const ws = await loadAccount(slug, accountId);
    if (!ws) return fail("That account no longer exists.");
    const parsed = certificateFormSchema(ws.asOfDate).safeParse(input);
    if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
    const db = getDb();
    if (certificateId) {
      const updated = await db
        .update(certificates)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(certificates.id, certificateId), eq(certificates.workspaceId, ws.id), eq(certificates.accountId, accountId)))
        .returning({ id: certificates.id });
      if (updated.length === 0) return fail("That certificate no longer exists.");
      refresh(slug);
      return ok({ id: certificateId });
    }
    const [row] = await db.insert(certificates).values({ workspaceId: ws.id, accountId, ...parsed.data }).returning({ id: certificates.id });
    refresh(slug);
    return ok({ id: row.id });
  } catch (err) {
    return fail(describeFailure("saving the certificate", err));
  }
}

/** Marks a certificate issued (or reissued) on the as-of date. */
export async function issueCertificate(slug: string, certificateId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    const updated = await getDb()
      .update(certificates)
      .set({ issuedOn: ws.asOfDate, updatedAt: new Date() })
      .where(and(eq(certificates.id, certificateId), eq(certificates.workspaceId, ws.id)))
      .returning({ id: certificates.id });
    if (updated.length === 0) return fail("That certificate no longer exists.");
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("issuing the certificate", err));
  }
}

export async function deleteCertificate(slug: string, certificateId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    await getDb().delete(certificates).where(and(eq(certificates.id, certificateId), eq(certificates.workspaceId, ws.id)));
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("deleting the certificate", err));
  }
}

/* ---------- Participants and sub-limits (policy page) ---------- */

async function loadPolicy(slug: string, policyId: string): Promise<Workspace | null> {
  const ws = await getWorkspaceBySlug(slug);
  if (!ws) return null;
  const p = await getDb().query.policies.findFirst({ where: and(eq(policies.id, policyId), eq(policies.workspaceId, ws.id)) });
  return p ? ws : null;
}

export async function saveParticipant(slug: string, policyId: string, participantId: string | null, input: ParticipantFormInput): Promise<ActionResult<{ id: string }>> {
  const parsed = participantFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await loadPolicy(slug, policyId);
    if (!ws) return fail("That policy no longer exists.");
    const db = getDb();
    if (participantId) {
      const updated = await db
        .update(policyParticipants)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(policyParticipants.id, participantId), eq(policyParticipants.workspaceId, ws.id), eq(policyParticipants.policyId, policyId)))
        .returning({ id: policyParticipants.id });
      if (updated.length === 0) return fail("That participant no longer exists.");
      refresh(slug);
      return ok({ id: participantId });
    }
    const [row] = await db.insert(policyParticipants).values({ workspaceId: ws.id, policyId, ...parsed.data }).returning({ id: policyParticipants.id });
    refresh(slug);
    return ok({ id: row.id });
  } catch (err) {
    return fail(describeFailure("saving the participant", err));
  }
}

export async function deleteParticipant(slug: string, participantId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    await getDb().delete(policyParticipants).where(and(eq(policyParticipants.id, participantId), eq(policyParticipants.workspaceId, ws.id)));
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("removing the participant", err));
  }
}

export async function saveSublimit(slug: string, policyId: string, sublimitId: string | null, input: SublimitFormInput): Promise<ActionResult<{ id: string }>> {
  const parsed = sublimitFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await loadPolicy(slug, policyId);
    if (!ws) return fail("That policy no longer exists.");
    const db = getDb();
    if (sublimitId) {
      const updated = await db
        .update(policySublimits)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(policySublimits.id, sublimitId), eq(policySublimits.workspaceId, ws.id), eq(policySublimits.policyId, policyId)))
        .returning({ id: policySublimits.id });
      if (updated.length === 0) return fail("That sub-limit no longer exists.");
      refresh(slug);
      return ok({ id: sublimitId });
    }
    const [row] = await db.insert(policySublimits).values({ workspaceId: ws.id, policyId, ...parsed.data }).returning({ id: policySublimits.id });
    refresh(slug);
    return ok({ id: row.id });
  } catch (err) {
    return fail(describeFailure("saving the sub-limit", err));
  }
}

export async function deleteSublimit(slug: string, sublimitId: string): Promise<ActionResult> {
  try {
    const ws = await getWorkspaceBySlug(slug);
    if (!ws) return fail("That workspace no longer exists.");
    await getDb().delete(policySublimits).where(and(eq(policySublimits.id, sublimitId), eq(policySublimits.workspaceId, ws.id)));
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("removing the sub-limit", err));
  }
}
