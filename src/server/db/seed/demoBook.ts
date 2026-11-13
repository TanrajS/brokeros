/**
 * Writes the fictional demo book into a workspace.
 * Used by `npm run db:seed` and by the Settings "Load demo book" action.
 */
import { randomUUID } from "node:crypto";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { addDays, daysBetween } from "@/lib/domain/dates";
import { getRenewalStage } from "@/lib/domain/renewals";
import type { ISODate } from "@/lib/domain/types";
import * as schema from "../schema";
import { buildDemoBook, type DemoAccount } from "./demoBookData";

type AnyDb = NeonHttpDatabase<typeof schema>;

export { buildDemoBook, DEMO_WORKSPACE_NAME } from "./demoBookData";

export interface SeedSummary {
  accounts: number;
  contacts: number;
  policies: number;
}

/** Inserts the demo book into an (assumed empty) workspace. Returns row counts. */
export async function loadDemoBook(db: AnyDb, workspaceId: string, asOf: ISODate): Promise<SeedSummary> {
  return insertBook(db, workspaceId, asOf, buildDemoBook(asOf));
}

async function insertBook(db: AnyDb, workspaceId: string, asOf: ISODate, book: DemoAccount[]): Promise<SeedSummary> {
  // Ids are assigned here so predecessor/successor links can be written in one pass.
  const accountIds = new Map(book.map((a) => [a.name, randomUUID()]));
  const policyIds = new Map(book.flatMap((a) => a.policies.map((p) => [p.key, randomUUID()] as const)));
  const pid = (key: string) => {
    const id = policyIds.get(key);
    if (!id) throw new Error(`Demo book: unknown policy key ${key}`);
    return id;
  };

  await db.insert(schema.accounts).values(
    book.map((a) => ({
      id: accountIds.get(a.name)!,
      workspaceId,
      name: a.name,
      industry: a.industry,
      annualRevenue: a.annualRevenue,
      employeeCount: a.employeeCount,
      province: a.province,
      producer: a.producer,
      accountManager: a.accountManager,
      status: a.status,
      notes: a.notes,
    })),
  );

  const contactRows = book.flatMap((a) =>
    a.contacts.map((c) => ({ workspaceId, accountId: accountIds.get(a.name)!, name: c.name, role: c.role, email: c.email, phone: c.phone })),
  );
  if (contactRows.length > 0) await db.insert(schema.contacts).values(contactRows);

  const policyRows = book.flatMap((a) =>
    a.policies.map((p) => ({
      id: pid(p.key),
      workspaceId,
      accountId: accountIds.get(a.name)!,
      carrier: p.carrier,
      lineOfBusiness: p.lineOfBusiness,
      policyNumber: p.policyNumber,
      effectiveDate: p.effectiveDate,
      expiryDate: p.expiryDate,
      occurrenceLimit: p.occurrenceLimit,
      aggregateLimit: p.aggregateLimit,
      deductible: p.deductible,
      annualPremium: p.annualPremium,
      commissionRate: p.commissionRate,
      exposureBasis: p.exposureBasis,
      exposureAmount: p.exposureAmount,
      endorsements: p.endorsements,
      renewalStatus: p.renewalStatus,
      previousPolicyId: p.previousKey ? pid(p.previousKey) : null,
      notes: p.notes,
      // Seeded silently: stage changes are only logged when they happen later.
      lastLoggedStage: getRenewalStage(daysBetween(asOf, p.expiryDate).value, p.renewalStatus).value,
      insurableValue: p.insurableValue,
      coinsurancePercent: p.coinsurancePercent,
    })),
  );
  // Predecessors first so the self-referencing foreign key is always satisfied.
  const firstPass = policyRows.filter((r) => r.previousPolicyId === null);
  const secondPass = policyRows.filter((r) => r.previousPolicyId !== null);
  if (firstPass.length > 0) await db.insert(schema.policies).values(firstPass);
  if (secondPass.length > 0) await db.insert(schema.policies).values(secondPass);

  const outcomeRows = book.flatMap((a) =>
    a.policies.flatMap((p) => {
      if (!p.outcome) return [];
      const o = p.outcome;
      return [
        {
          workspaceId,
          policyId: pid(p.key),
          outcome: o.type,
          lostReason: o.type === "lost" ? o.lostReason : null,
          reason: o.type === "non_renewed" ? o.reason : null,
          competingPremium: o.type === "lost" ? o.competingPremium : null,
          successorPolicyId: o.type === "renewed" ? pid(o.successorKey) : null,
          priorStatus: "in_progress" as const,
          recordedAsOf: o.recordedAsOf,
        },
      ];
    }),
  );
  if (outcomeRows.length > 0) await db.insert(schema.renewalOutcomes).values(outcomeRows);

  const checklistRows = book.flatMap((a) =>
    a.policies.flatMap((p) =>
      (p.checklist ?? []).map((c, i) => ({
        workspaceId,
        policyId: pid(p.key),
        label: c.label,
        required: true,
        done: c.done,
        source: c.source,
        sortOrder: i,
      })),
    ),
  );
  if (checklistRows.length > 0) await db.insert(schema.checklistItems).values(checklistRows);

  const taskRows = book.flatMap((a) => [
    ...a.accountTasks.map((t) => ({ workspaceId, accountId: accountIds.get(a.name)!, policyId: null, ...t })),
    ...a.policies.flatMap((p) => p.tasks.map((t) => ({ workspaceId, accountId: accountIds.get(a.name)!, policyId: pid(p.key), ...t }))),
  ]);
  if (taskRows.length > 0) await db.insert(schema.tasks).values(taskRows);

  const claimRows = book.flatMap((a) =>
    a.claims.map((c) => ({
      workspaceId,
      accountId: accountIds.get(a.name)!,
      policyId: pid(c.policyKey),
      lineOfBusiness: c.lineOfBusiness,
      claimNumber: c.claimNumber,
      dateOfLoss: c.dateOfLoss,
      dateReported: c.dateReported,
      description: c.description,
      paid: c.paid,
      reserved: c.reserved,
      status: c.status,
    })),
  );
  if (claimRows.length > 0) await db.insert(schema.claims).values(claimRows);

  const participantRows = book.flatMap((a) => a.policies.flatMap((p) => p.participants.map((x) => ({ workspaceId, policyId: pid(p.key), ...x, notes: null }))));
  if (participantRows.length > 0) await db.insert(schema.policyParticipants).values(participantRows);
  const sublimitRows = book.flatMap((a) => a.policies.flatMap((p) => p.sublimits.map((x) => ({ workspaceId, policyId: pid(p.key), ...x, notes: null }))));
  if (sublimitRows.length > 0) await db.insert(schema.policySublimits).values(sublimitRows);

  const layerRows = book.flatMap((a) =>
    a.towerLayers.map((t) => ({
      workspaceId,
      accountId: accountIds.get(a.name)!,
      lineGroup: t.lineGroup,
      layerType: t.layerType,
      attachment: t.attachment,
      limit: t.limit,
      premium: t.premium,
      carrier: t.carrier,
      policyId: t.policyKey ? pid(t.policyKey) : null,
    })),
  );
  if (layerRows.length > 0) await db.insert(schema.towerLayers).values(layerRows);

  const requirementRows = book.flatMap((a) => a.requirements.map((r) => ({ workspaceId, accountId: accountIds.get(a.name)!, ...r })));
  if (requirementRows.length > 0) await db.insert(schema.contractRequirements).values(requirementRows);

  const certificateRows = book.flatMap((a) =>
    a.certificates.map((c) => ({
      workspaceId,
      accountId: accountIds.get(a.name)!,
      holder: c.holder,
      operationsDescription: c.operationsDescription,
      coverages: c.coverages,
      requiredBy: c.requiredByOffset === null ? null : addDays(asOf, c.requiredByOffset).value,
      issuedOn: c.issuedOnOffset === null ? null : addDays(asOf, c.issuedOnOffset).value,
      notes: null,
    })),
  );
  if (certificateRows.length > 0) await db.insert(schema.certificates).values(certificateRows);

  const activityRows = book.flatMap((a) =>
    a.activities.map((x) => ({
      workspaceId,
      accountId: accountIds.get(a.name)!,
      policyId: x.policyKey ? pid(x.policyKey) : null,
      kind: x.kind,
      body: x.body,
      asOfDate: x.asOfDate,
    })),
  );
  if (activityRows.length > 0) await db.insert(schema.activities).values(activityRows);

  return { accounts: book.length, contacts: contactRows.length, policies: policyRows.length };
}
