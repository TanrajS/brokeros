/**
 * Maps one demo account onto program inputs so tests can run the seed through
 * the program functions without a database. Pure.
 */
import { addDays } from "@/lib/domain/dates";
import type { CertificateInput, LineGroup, ProgramLayerInput, ProgramPolicy, RequirementInput, TowerLayerInput } from "@/lib/domain/program";
import type { ISODate } from "@/lib/domain/types";
import type { DemoAccount } from "./demoBookData";

export function demoAccountToProgram(account: DemoAccount, asOf: ISODate): { policies: ProgramPolicy[]; layers: TowerLayerInput[]; requirements: RequirementInput[]; certificates: CertificateInput[] } {
  return {
    policies: account.policies.map((p) => ({
      id: p.key,
      lineOfBusiness: p.lineOfBusiness,
      occurrenceLimit: p.occurrenceLimit,
      aggregateLimit: p.aggregateLimit,
      endorsements: p.endorsements,
      effectiveDate: p.effectiveDate,
      expiryDate: p.expiryDate,
      renewalStatus: p.renewalStatus,
      previousPolicyId: p.previousKey,
      renewedOn: p.outcome?.type === "renewed" ? p.outcome.recordedAsOf : null,
    })),
    layers: account.towerLayers.map((t, i) => ({ id: `l${i}`, layerType: t.layerType, attachment: t.attachment, limit: t.limit, premium: t.premium, carrier: t.carrier })),
    requirements: account.requirements.map((r, i) => ({
      id: `r${i}`,
      contractName: r.contractName,
      counterparty: r.counterparty,
      coverage: r.coverage,
      requiredOccurrence: r.requiredOccurrence,
      requiredAggregate: r.requiredAggregate,
      requiredEndorsements: r.requiredEndorsements,
    })),
    certificates: account.certificates.map((c, i) => ({
      id: `c${i}`,
      holder: c.holder,
      coverages: c.coverages,
      requiredBy: c.requiredByOffset === null ? null : addDays(asOf, c.requiredByOffset).value,
      issuedOn: c.issuedOnOffset === null ? null : addDays(asOf, c.issuedOnOffset).value,
    })),
  };
}

/** v1.3: one line group's layers with their participations, as the placement functions expect them. */
export function demoProgramLayers(account: DemoAccount, lineGroup: LineGroup): ProgramLayerInput[] {
  return account.towerLayers
    .filter((t) => t.lineGroup === lineGroup)
    .map((t, i) => ({
      id: `${lineGroup}-l${i}`,
      towerLabel: t.towerLabel ?? "Tower 1",
      layerType: t.layerType,
      attachment: t.attachment,
      limit: t.limit,
      basis: t.basis ?? "per_occurrence",
      policyId: t.policyKey,
      participations: (t.participations ?? [{ insurer: t.carrier, writtenLinePct: null, signedLinePct: 100, premium: t.premium, isLead: true }]).map((x, j) => ({
        id: `${lineGroup}-l${i}-p${j}`,
        insurer: x.insurer,
        writtenLinePct: x.writtenLinePct,
        signedLinePct: x.signedLinePct,
        premium: x.premium,
        policyNumber: x.policyNumber ?? null,
        isLead: x.isLead ?? false,
      })),
    }));
}
