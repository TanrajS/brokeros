/**
 * Maps one demo account onto program inputs so tests can run the seed through
 * the program functions without a database. Pure.
 */
import type { LineGroup, ProgramLayerInput, TowerLayerInput } from "@/lib/domain/program";
import type { DemoAccount } from "./demoBookData";

export function demoAccountToProgram(account: DemoAccount): { layers: TowerLayerInput[] } {
  return { layers: account.towerLayers.map((t, i) => ({ id: `l${i}`, layerType: t.layerType, attachment: t.attachment, limit: t.limit, premium: t.premium, carrier: t.carrier })) };
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
      policyId: t.policyKey,
      participations: (t.participations ?? [{ insurer: t.carrier, writtenLinePct: null, signedLinePct: 100, premium100: t.premium, isLead: true }]).map((x, j) => ({
        id: `${lineGroup}-l${i}-p${j}`,
        insurer: x.insurer,
        writtenLinePct: x.writtenLinePct,
        signedLinePct: x.signedLinePct,
        premium100: x.premium100,
        policyNumber: x.policyNumber ?? null,
        isLead: x.isLead ?? false,
      })),
    }));
}
