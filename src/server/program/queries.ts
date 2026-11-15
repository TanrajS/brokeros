import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { CertificateInput, ProgramLayerInput, ProgramPolicy, RequirementInput } from "@/lib/domain/program";
import { certificateStatus } from "@/lib/domain/program";
import { getDb } from "@/server/db/client";
import {
  accounts,
  certificates,
  renewalOutcomes,
  contractRequirements,
  layerParticipations,
  policies,
  policyParticipants,
  policySublimits,
  programLayers,
  type Account,
  type Certificate,
  type ContractRequirement,
  type LayerParticipation,
  type Policy,
  type PolicyParticipant,
  type PolicySublimit,
  type ProgramLayer,
  type Workspace,
} from "@/server/db/schema";

/** `renewedOn` is the recorded as-of date of a renewed outcome on the policy, from `renewedOnByPolicy`. */
export function toProgramPolicy(p: Policy, renewedOn: string | null = null): ProgramPolicy {
  return {
    renewedOn,
    id: p.id,
    lineOfBusiness: p.lineOfBusiness,
    occurrenceLimit: p.occurrenceLimit,
    aggregateLimit: p.aggregateLimit,
    endorsements: p.endorsements,
    effectiveDate: p.effectiveDate,
    expiryDate: p.expiryDate,
    renewalStatus: p.renewalStatus,
    previousPolicyId: p.previousPolicyId,
  };
}

/** A program layer with its participations, as the domain expects it (v1.3). */
export function toProgramLayerInput(l: ProgramLayer, parts: LayerParticipation[]): ProgramLayerInput {
  return {
    id: l.id,
    towerLabel: l.towerLabel,
    layerType: l.layerType,
    attachment: l.attachment,
    limit: l.limit,
    basis: l.basis,
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

export function toRequirementInput(r: ContractRequirement): RequirementInput {
  return {
    id: r.id,
    contractName: r.contractName,
    counterparty: r.counterparty,
    coverage: r.coverage,
    requiredOccurrence: r.requiredOccurrence,
    requiredAggregate: r.requiredAggregate,
    requiredEndorsements: r.requiredEndorsements,
  };
}

export function toCertificateInput(c: Certificate): CertificateInput {
  return { id: c.id, holder: c.holder, coverages: c.coverages, requiredBy: c.requiredBy, issuedOn: c.issuedOn };
}

/** Map of policy id → as-of date a renewed outcome was recorded. */
export async function renewedOnByPolicy(workspaceId: string, policyIds: string[]): Promise<Map<string, string>> {
  if (policyIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ policyId: renewalOutcomes.policyId, recordedAsOf: renewalOutcomes.recordedAsOf, outcome: renewalOutcomes.outcome })
    .from(renewalOutcomes)
    .where(and(eq(renewalOutcomes.workspaceId, workspaceId), inArray(renewalOutcomes.policyId, policyIds)));
  return new Map(rows.filter((r) => r.outcome === "renewed").map((r) => [r.policyId, r.recordedAsOf]));
}

export interface ProgramInputs {
  account: Account;
  policies: Policy[];
  renewedOn: Map<string, string>;
  /** Raw layer rows (line group lives here). */
  layerRows: ProgramLayer[];
  /** Layers with participations; filter by `layerRows` line group through `layersFor`. */
  layers: ProgramLayerInput[];
  requirements: ContractRequirement[];
  certificates: Certificate[];
  participantsByPolicy: Map<string, PolicyParticipant[]>;
}

/** Everything the Program tab needs for one account. */
export async function loadProgramInputs(ws: Workspace, accountId: string): Promise<ProgramInputs | null> {
  const db = getDb();
  const account = await db.query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) });
  if (!account) return null;
  const [policyRows, program, requirementRows, certificateRows] = await Promise.all([
    db.select().from(policies).where(and(eq(policies.workspaceId, ws.id), eq(policies.accountId, accountId))).orderBy(asc(policies.effectiveDate)),
    loadProgramLayers(ws.id, accountId),
    db.select().from(contractRequirements).where(and(eq(contractRequirements.workspaceId, ws.id), eq(contractRequirements.accountId, accountId))).orderBy(asc(contractRequirements.contractName), asc(contractRequirements.coverage)),
    db.select().from(certificates).where(and(eq(certificates.workspaceId, ws.id), eq(certificates.accountId, accountId))).orderBy(asc(certificates.holder)),
  ]);
  const [participantRows, renewedOn] = await Promise.all([
    policyRows.length
      ? db.select().from(policyParticipants).where(inArray(policyParticipants.policyId, policyRows.map((p) => p.id))).orderBy(asc(policyParticipants.role), asc(policyParticipants.signedLine))
      : Promise.resolve([]),
    renewedOnByPolicy(ws.id, policyRows.map((p) => p.id)),
  ]);
  const participantsByPolicy = new Map<string, PolicyParticipant[]>();
  for (const r of participantRows) participantsByPolicy.set(r.policyId, [...(participantsByPolicy.get(r.policyId) ?? []), r]);
  return { account, policies: policyRows, renewedOn, layerRows: program.layerRows, layers: program.layers, requirements: requirementRows, certificates: certificateRows, participantsByPolicy };
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

export interface CertificateDue {
  certificate: Certificate;
  accountId: string;
  accountName: string;
  reasons: string[];
}

/** Every certificate in the workspace that needs reissue, for the Renewals page. */
export async function listCertificatesDue(ws: Workspace): Promise<CertificateDue[]> {
  const db = getDb();
  const [certRows, policyRows, accountRows] = await Promise.all([
    db.select().from(certificates).where(eq(certificates.workspaceId, ws.id)).orderBy(asc(certificates.holder)),
    db.select().from(policies).where(eq(policies.workspaceId, ws.id)),
    db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(eq(accounts.workspaceId, ws.id)),
  ]);
  const renewedOn = await renewedOnByPolicy(ws.id, policyRows.map((p) => p.id));
  const name = new Map(accountRows.map((a) => [a.id, a.name]));
  const byAccount = new Map<string, ProgramPolicy[]>();
  for (const p of policyRows) byAccount.set(p.accountId, [...(byAccount.get(p.accountId) ?? []), toProgramPolicy(p, renewedOn.get(p.id) ?? null)]);
  return certRows
    .map((c) => ({ certificate: c, accountId: c.accountId, accountName: name.get(c.accountId) ?? "Unknown account", result: certificateStatus(toCertificateInput(c), byAccount.get(c.accountId) ?? [], ws.asOfDate).value }))
    .filter((x) => x.result.status === "reissue_needed")
    .map(({ result, ...rest }) => ({ ...rest, reasons: result.reasons }))
    .sort((a, b) => a.accountName.localeCompare(b.accountName) || a.certificate.holder.localeCompare(b.certificate.holder));
}

/** Certificates on one account with derived status, for the Account page. */
export async function listAccountCertificates(ws: Workspace, accountId: string, accountPolicies: Policy[]) {
  const rows = await getDb()
    .select()
    .from(certificates)
    .where(and(eq(certificates.workspaceId, ws.id), eq(certificates.accountId, accountId)))
    .orderBy(asc(certificates.holder));
  const renewedOn = await renewedOnByPolicy(ws.id, accountPolicies.map((p) => p.id));
  const program = accountPolicies.map((p) => toProgramPolicy(p, renewedOn.get(p.id) ?? null));
  return rows.map((c) => ({ certificate: c, result: certificateStatus(toCertificateInput(c), program, ws.asOfDate).value }));
}
