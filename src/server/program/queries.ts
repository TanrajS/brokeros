import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { ProgramLayerInput } from "@/lib/domain/program";
import { getDb } from "@/server/db/client";
import {
  accounts,
  layerParticipations,
  policies,
  policyParticipants,
  policySublimits,
  programLayers,
  type Account,
  type LayerParticipation,
  type Policy,
  type PolicyParticipant,
  type PolicySublimit,
  type ProgramLayer,
  type Workspace,
} from "@/server/db/schema";

/** `renewedOn` is the recorded as-of date of a renewed outcome on the policy, from `renewedOnByPolicy`. */
export function toProgramLayerInput(l: ProgramLayer, parts: LayerParticipation[]): ProgramLayerInput {
  return {
    id: l.id,
    towerLabel: l.towerLabel,
    layerType: l.layerType,
    attachment: l.attachment,
    limit: l.limit,
    policyId: l.policyId,
    notes: l.notes,
    participations: parts.map((p) => ({ id: p.id, insurer: p.insurer, writtenLinePct: p.writtenLinePct, signedLinePct: p.signedLinePct, premium: p.premium, policyNumber: p.policyNumber, isLead: p.isLead })),
  };
}

/** Layers and participations for one account, joined, oldest participation first within a layer. */
export async function loadProgramLayers(workspaceId: string, accountId: string): Promise<{ layerRows: ProgramLayer[]; participationRows: LayerParticipation[]; layers: ProgramLayerInput[] }> {
  const db = getDb();
  const layerRows = await db.select().from(programLayers).where(and(eq(programLayers.workspaceId, workspaceId), eq(programLayers.accountId, accountId))).orderBy(asc(programLayers.towerLabel), asc(programLayers.attachment), asc(programLayers.limit));
  const participationRows = layerRows.length
    ? await db.select().from(layerParticipations).where(inArray(layerParticipations.layerId, layerRows.map((l) => l.id))).orderBy(asc(layerParticipations.createdAt), asc(layerParticipations.insurer))
    : [];
  const layers = layerRows.map((l) => toProgramLayerInput(l, participationRows.filter((p) => p.layerId === l.id)));
  return { layerRows, participationRows, layers };
}

export interface ProgramInputs {
  account: Account;
  policies: Policy[];
  /** Raw layer rows (line group lives here). */
  layerRows: ProgramLayer[];
  /** Layers with participations; filter by `layerRows` line group through `layersFor`. */
  layers: ProgramLayerInput[];
  participantsByPolicy: Map<string, PolicyParticipant[]>;
}

/** Everything the Program tab needs for one account. */
export async function loadProgramInputs(ws: Workspace, accountId: string): Promise<ProgramInputs | null> {
  const db = getDb();
  const account = await db.query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) });
  if (!account) return null;
  const [policyRows, program] = await Promise.all([
    db.select().from(policies).where(and(eq(policies.workspaceId, ws.id), eq(policies.accountId, accountId))).orderBy(asc(policies.effectiveDate)),
    loadProgramLayers(ws.id, accountId),
  ]);
  const participantRows = policyRows.length
    ? await db.select().from(policyParticipants).where(inArray(policyParticipants.policyId, policyRows.map((p) => p.id))).orderBy(asc(policyParticipants.role), asc(policyParticipants.signedLine))
    : [];
  const participantsByPolicy = new Map<string, PolicyParticipant[]>();
  for (const r of participantRows) participantsByPolicy.set(r.policyId, [...(participantsByPolicy.get(r.policyId) ?? []), r]);
  return { account, policies: policyRows, layerRows: program.layerRows, layers: program.layers, participantsByPolicy };
}

/** The layers of one line group. */
export function layersFor(inputs: Pick<ProgramInputs, "layerRows" | "layers">, lineGroup: ProgramLayer["lineGroup"]): ProgramLayerInput[] {
  const ids = new Set(inputs.layerRows.filter((l) => l.lineGroup === lineGroup).map((l) => l.id));
  return inputs.layers.filter((l) => ids.has(l.id));
}

/** A policy's co-insurers and sub-limits, for the policy page. */
export async function loadPolicyExtras(workspaceId: string, policyId: string): Promise<{ participants: PolicyParticipant[]; sublimits: PolicySublimit[] }> {
  const db = getDb();
  const [participants, sublimits] = await Promise.all([
    db.select().from(policyParticipants).where(and(eq(policyParticipants.workspaceId, workspaceId), eq(policyParticipants.policyId, policyId))).orderBy(asc(policyParticipants.role), asc(policyParticipants.carrier)),
    db.select().from(policySublimits).where(and(eq(policySublimits.workspaceId, workspaceId), eq(policySublimits.policyId, policyId))).orderBy(asc(policySublimits.name)),
  ]);
  return { participants, sublimits };
}

/** Number of co-insurers per policy, for tables that show "+N". */
export async function countParticipants(workspaceId: string, policyIds: string[]): Promise<Map<string, number>> {
  if (policyIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ policyId: policyParticipants.policyId })
    .from(policyParticipants)
    .where(and(eq(policyParticipants.workspaceId, workspaceId), inArray(policyParticipants.policyId, policyIds)));
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.policyId, (out.get(r.policyId) ?? 0) + 1);
  return out;
}