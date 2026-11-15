/**
 * Writes the fictional demo book into a workspace.
 * Used by `npm run db:seed` and by the Settings "Load demo book" action.
 */
import { randomUUID } from "node:crypto";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { daysBetween } from "@/lib/domain/dates";
import { getRenewalStage } from "@/lib/domain/renewals";
import type { ISODate } from "@/lib/domain/types";
import * as schema from "../schema";
import { buildDemoBook, type DemoAccount } from "./demoBookData";
import { ensureSeedDocuments, seedPolicyYear } from "./demoDocuments";

type AnyDb = NeonHttpDatabase<typeof schema>;

export { buildDemoBook, DEMO_WORKSPACE_NAME } from "./demoBookData";

export interface SeedSummary {
  accounts: number;
  contacts: number;
  policies: number;
  documents: number;
}

/**
 * Inserts the demo book into an (assumed empty) workspace. Seed documents are
 * uploaded to Blob once under `seed/` and referenced by every workspace that
 * loads the book, so re-seeding and the nightly reset never re-upload.
 */
export async function loadDemoBook(db: AnyDb, workspaceId: string, asOf: ISODate, log: (line: string) => void = () => {}): Promise<SeedSummary> {
  const book = buildDemoBook(asOf);
  const blobs = await ensureSeedDocuments(book, asOf, log);
  return insertBook(db, workspaceId, asOf, book, blobs);
}

async function insertBook(db: AnyDb, workspaceId: string, asOf: ISODate, book: DemoAccount[], blobs: Map<string, { url: string; pathname: string; fileName: string; sizeBytes: number }> | null): Promise<SeedSummary> {
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
      brokerFees: a.brokerFees,
      riskControlSpend: a.riskControlSpend,
      claimsAdminCost: a.claimsAdminCost,
      toleranceOccurrence: a.toleranceOccurrence,
      toleranceYear: a.toleranceYear,
      permissibleLossRatio: a.permissibleLossRatio,
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
      peril: c.peril,
      valueAtRisk: c.valueAtRisk,
    })),
  );
  if (claimRows.length > 0) await db.insert(schema.claims).values(claimRows);

  // v1.3: every policy with a deductible gets its default schedule row, plus any named-peril rules.
  const deductibleRows = book.flatMap((a) =>
    a.policies.flatMap((p) => [
      ...(p.deductible !== null ? [{ workspaceId, policyId: pid(p.key), appliesTo: "All other perils", kind: "flat" as const, amount: p.deductible, isDefault: true }] : []),
      ...p.deductibles.map((r) => ({
        workspaceId,
        policyId: pid(p.key),
        appliesTo: r.appliesTo,
        kind: r.kind,
        amount: r.amount ?? null,
        percent: r.percent ?? null,
        minimum: r.minimum ?? null,
        maximum: r.maximum ?? null,
        hours: r.hours ?? null,
        notes: r.notes ?? null,
        isDefault: false,
      })),
    ]),
  );
  if (deductibleRows.length > 0) await db.insert(schema.policyDeductibles).values(deductibleRows);

  const participantRows = book.flatMap((a) => a.policies.flatMap((p) => p.participants.map((x) => ({ workspaceId, policyId: pid(p.key), ...x, notes: null }))));
  if (participantRows.length > 0) await db.insert(schema.policyParticipants).values(participantRows);
  const sublimitRows = book.flatMap((a) => a.policies.flatMap((p) => p.sublimits.map((x) => ({ workspaceId, policyId: pid(p.key), ...x, notes: null }))));
  if (sublimitRows.length > 0) await db.insert(schema.policySublimits).values(sublimitRows);

  // v1.3: program layers with their participations (a v0.5 layer is one insurer at 100%).
  const layerRows: (typeof schema.programLayers.$inferInsert)[] = [];
  const participationRows: (typeof schema.layerParticipations.$inferInsert)[] = [];
  for (const a of book) {
    for (const t of a.towerLayers) {
      const id = randomUUID();
      layerRows.push({
        id,
        workspaceId,
        accountId: accountIds.get(a.name)!,
        lineGroup: t.lineGroup,
        towerLabel: t.towerLabel ?? "Tower 1",
        layerType: t.layerType,
        attachment: t.attachment,
        limit: t.limit,
        policyId: t.policyKey ? pid(t.policyKey) : null,
      });
      const parts = t.participations ?? [{ insurer: t.carrier, writtenLinePct: null, signedLinePct: 100, premium: t.premium, isLead: true }];
      for (const x of parts) {
        participationRows.push({ workspaceId, layerId: id, insurer: x.insurer, writtenLinePct: x.writtenLinePct, signedLinePct: x.signedLinePct, premium: x.premium, policyNumber: x.policyNumber ?? null, isLead: x.isLead ?? false });
      }
    }
  }
  if (layerRows.length > 0) await db.insert(schema.programLayers).values(layerRows);
  if (participationRows.length > 0) await db.insert(schema.layerParticipations).values(participationRows);

  const optionRows = book.flatMap((a) =>
    a.policies.flatMap((p) => p.retentionOptions.map((o) => ({ workspaceId, policyId: pid(p.key), label: o.label, carrier: o.carrier, deductible: o.deductible, aggregateCap: o.aggregateCap, premium: o.premium }))),
  );
  if (optionRows.length > 0) await db.insert(schema.quoteOptions).values(optionRows);

  // v1.4: documents point at the shared seed blobs; nothing is uploaded here.
  const documentRows = blobs
    ? book.flatMap((a) =>
        a.documents.flatMap((d) => {
          const blob = blobs.get(d.key);
          if (!blob) return [];
          return [
            {
              workspaceId,
              accountId: accountIds.get(a.name)!,
              policyId: d.policyKey ? pid(d.policyKey) : null,
              docType: d.docType,
              title: d.title,
              policyYear: seedPolicyYear(d, a),
              status: d.docType === "proposal" ? d.status : null,
              markets: d.docType === "submission" ? d.markets : [],
              fileUrl: blob.url,
              filePathname: blob.pathname,
              fileName: blob.fileName,
              mimeType: "application/pdf",
              sizeBytes: blob.sizeBytes,
              notes: d.notes,
              uploadedAt: new Date(`${asOf}T12:00:00Z`),
              isSeed: true,
            },
          ];
        }),
      )
    : [];
  if (documentRows.length > 0) await db.insert(schema.documents).values(documentRows);

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

  return { accounts: book.length, contacts: contactRows.length, policies: policyRows.length, documents: documentRows.length };
}
