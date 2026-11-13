"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { LINE_GROUP_PRIMARY } from "@/lib/domain/program";
import {
  certificateFormSchema,
  participantFormSchema,
  requirementFormSchema,
  sublimitFormSchema,
  towerLayerFormSchema,
  type CertificateFormInput,
  type ParticipantFormInput,
  type RequirementFormInput,
  type SublimitFormInput,
  type TowerLayerFormInput,
} from "@/lib/schemas/program";
import { describeFailure, fail, fieldErrorsFromZod, ok, type ActionResult } from "@/server/actionResult";
import { getDb } from "@/server/db/client";
import { accounts, certificates, contractRequirements, policies, policyParticipants, policySublimits, towerLayers, type Workspace } from "@/server/db/schema";
import { getWorkspaceBySlug } from "@/server/workspace/queries";

async function loadAccount(slug: string, accountId: string): Promise<Workspace | null> {
  const ws = await getWorkspaceBySlug(slug);
  if (!ws) return null;
  const account = await getDb().query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) });
  return account ? ws : null;
}

function refresh(slug: string) {
  revalidatePath(`/w/${slug}`, "layout");
}

/* ---------- Tower layers ---------- */

async function checkLayerPolicy(workspaceId: string, accountId: string, lineGroup: "gl" | "auto", policyId: string | null): Promise<string | null> {
  if (!policyId) return null;
  const p = await getDb().query.policies.findFirst({ where: and(eq(policies.id, policyId), eq(policies.workspaceId, workspaceId), eq(policies.accountId, accountId)) });
  if (!p) return "Choose a policy on this account";
  if (p.lineOfBusiness !== LINE_GROUP_PRIMARY[lineGroup] && p.lineOfBusiness !== "Umbrella/Excess") return `Choose a ${LINE_GROUP_PRIMARY[lineGroup]} or Umbrella/Excess policy`;
  return null;
}

export async function saveTowerLayer(slug: string, accountId: string, layerId: string | null, input: TowerLayerFormInput): Promise<ActionResult<{ id: string }>> {
  const parsed = towerLayerFormSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", fieldErrorsFromZod(parsed.error));
  try {
    const ws = await loadAccount(slug, accountId);
    if (!ws) return fail("That account no longer exists.");
    const v = parsed.data;
    const policyError = await checkLayerPolicy(ws.id, accountId, v.lineGroup, v.policyId);
    if (policyError) return fail("Please fix the highlighted fields.", { policyId: policyError });
    const db = getDb();
    const values = { lineGroup: v.lineGroup, layerType: v.layerType, carrier: v.carrier, attachment: v.attachment, limit: v.limit, premium: v.premium, policyId: v.policyId };
    if (layerId) {
      const updated = await db
        .update(towerLayers)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(towerLayers.id, layerId), eq(towerLayers.workspaceId, ws.id), eq(towerLayers.accountId, accountId)))
        .returning({ id: towerLayers.id });
      if (updated.length === 0) return fail("That layer no longer exists.");
      refresh(slug);
      return ok({ id: layerId });
    }
    const [row] = await db.insert(towerLayers).values({ workspaceId: ws.id, accountId, ...values }).returning({ id: towerLayers.id });
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
    await getDb().delete(towerLayers).where(and(eq(towerLayers.id, layerId), eq(towerLayers.workspaceId, ws.id)));
    refresh(slug);
    return ok(undefined);
  } catch (err) {
    return fail(describeFailure("deleting the layer", err));
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
