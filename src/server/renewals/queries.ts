import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { LineOfBusiness, RenewalStatus } from "@/lib/constants";
import { daysBetween } from "@/lib/domain/dates";
import {
  RENEWAL_STAGES,
  checklistReadiness,
  checklistTemplate,
  getRenewalStage,
  isTaskOverdue,
  summarizeByStage,
  type Readiness,
  type RenewalStage,
  type StageSummaryRow,
} from "@/lib/domain/renewals";
import type { ISODate } from "@/lib/domain/types";
import { getDb } from "@/server/db/client";
import {
  accounts,
  activities,
  checklistItems,
  policies,
  renewalOutcomes,
  tasks,
  type Account,
  type Activity,
  type ChecklistItem,
  type Policy,
  type RenewalOutcome,
  type Task,
  type Workspace,
} from "@/server/db/schema";
import { getExecutor } from "@/server/db/tx";
import { ensureChecklist } from "./checklist";

/* ------------------------------------------------------------------ */
/* Renewals board / list                                               */
/* ------------------------------------------------------------------ */

export interface RenewalFilters {
  producer: string;
  manager: string;
  line: string;
  carrier: string;
  stage: string;
  /** YYYY-MM: only policies expiring in this calendar month (linked from the Dashboard chart). */
  month: string;
  /** "1": only open policies (no outcome yet). */
  open: string;
}

export interface RenewalRow {
  policyId: string;
  accountId: string;
  accountName: string;
  producer: string | null;
  accountManager: string | null;
  lineOfBusiness: LineOfBusiness;
  carrier: string;
  premium: number;
  expiryDate: ISODate;
  daysToExpiry: number;
  renewalStatus: RenewalStatus;
  stage: RenewalStage;
  readiness: Readiness;
  /** True when the readiness comes from the template because the checklist has not been opened yet. */
  readinessFromTemplate: boolean;
  overdueTasks: number;
}

export interface RenewalsView {
  rows: RenewalRow[];
  summary: StageSummaryRow[];
  overdueTasks: number;
  options: { producers: string[]; managers: string[]; lines: string[]; carriers: string[] };
  totalPolicies: number;
}

export async function listRenewals(ws: Workspace, filters: RenewalFilters, sortDir: "asc" | "desc"): Promise<RenewalsView> {
  const db = getDb();
  const [policyRows, checklistCounts, taskRows] = await Promise.all([
    db
      .select({
        policyId: policies.id,
        accountId: accounts.id,
        accountName: accounts.name,
        producer: accounts.producer,
        accountManager: accounts.accountManager,
        lineOfBusiness: policies.lineOfBusiness,
        carrier: policies.carrier,
        premium: policies.annualPremium,
        expiryDate: policies.expiryDate,
        renewalStatus: policies.renewalStatus,
      })
      .from(policies)
      .innerJoin(accounts, eq(accounts.id, policies.accountId))
      .where(eq(policies.workspaceId, ws.id)),
    db
      .select({
        policyId: checklistItems.policyId,
        total: count(),
        done: sql<number>`count(*) filter (where ${checklistItems.done})`.mapWith(Number),
      })
      .from(checklistItems)
      .where(eq(checklistItems.workspaceId, ws.id))
      .groupBy(checklistItems.policyId),
    db
      .select({ policyId: tasks.policyId, dueDate: tasks.dueDate, done: tasks.done })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, ws.id), eq(tasks.done, false), lt(tasks.dueDate, ws.asOfDate), isNotNull(tasks.policyId))),
  ]);

  const checklistByPolicy = new Map(checklistCounts.map((c) => [c.policyId, c]));
  const overdueByPolicy = new Map<string, number>();
  for (const t of taskRows) {
    if (!t.policyId || !isTaskOverdue(ws.asOfDate, t.dueDate, t.done).value) continue;
    overdueByPolicy.set(t.policyId, (overdueByPolicy.get(t.policyId) ?? 0) + 1);
  }

  const all: RenewalRow[] = policyRows.map((p) => {
    const daysToExpiry = daysBetween(ws.asOfDate, p.expiryDate).value;
    const counts = checklistByPolicy.get(p.policyId);
    const readinessFromTemplate = !counts;
    const readiness = counts
      ? checklistReadiness(counts.done, counts.total).value
      : checklistReadiness(0, checklistTemplate(p.lineOfBusiness).value.length).value;
    return {
      ...p,
      daysToExpiry,
      stage: getRenewalStage(daysToExpiry, p.renewalStatus).value,
      readiness,
      readinessFromTemplate,
      overdueTasks: overdueByPolicy.get(p.policyId) ?? 0,
    };
  });

  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
  const options = {
    producers: uniq(all.map((r) => r.producer)),
    managers: uniq(all.map((r) => r.accountManager)),
    lines: uniq(all.map((r) => r.lineOfBusiness)),
    carriers: uniq(all.map((r) => r.carrier)),
  };

  const rows = all
    .filter(
      (r) =>
        (!filters.producer || r.producer === filters.producer) &&
        (!filters.manager || r.accountManager === filters.manager) &&
        (!filters.line || r.lineOfBusiness === filters.line) &&
        (!filters.carrier || r.carrier === filters.carrier) &&
        (!filters.stage || r.stage === filters.stage) &&
        (!filters.month || r.expiryDate.startsWith(`${filters.month}-`)) &&
        (filters.open !== "1" || r.renewalStatus === "not_started" || r.renewalStatus === "in_progress"),
    )
    .sort((a, b) => (a.daysToExpiry - b.daysToExpiry) * (sortDir === "desc" ? -1 : 1) || a.accountName.localeCompare(b.accountName));

  return {
    rows,
    summary: summarizeByStage(rows.map((r) => ({ stage: r.stage, premium: r.premium }))).value,
    overdueTasks: rows.reduce((n, r) => n + r.overdueTasks, 0),
    options,
    totalPolicies: all.length,
  };
}

export function isRenewalStage(s: string): s is RenewalStage {
  return (RENEWAL_STAGES as readonly string[]).includes(s);
}

/* ------------------------------------------------------------------ */
/* Policy page                                                         */
/* ------------------------------------------------------------------ */

export interface PolicyPageData {
  account: Account;
  policy: Policy;
  checklist: ChecklistItem[];
  tasks: Task[];
  outcome: RenewalOutcome | null;
  predecessor: Policy | null;
  successor: Policy | null;
  successorHasOutcome: boolean;
  accountPolicies: Pick<Policy, "id" | "lineOfBusiness" | "carrier" | "expiryDate">[];
}

export async function getPolicyPageData(ws: Workspace, accountId: string, policyId: string): Promise<PolicyPageData | null> {
  const db = getDb();
  const policy = await db.query.policies.findFirst({
    where: and(eq(policies.id, policyId), eq(policies.workspaceId, ws.id), eq(policies.accountId, accountId)),
  });
  if (!policy) return null;
  const account = await db.query.accounts.findFirst({ where: and(eq(accounts.id, accountId), eq(accounts.workspaceId, ws.id)) });
  if (!account) return null;

  // "Generated for a policy when first opened."
  const checklist = await ensureChecklist(getExecutor(), policy);

  const [policyTasks, outcome, predecessor, accountPolicies] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.policyId, policy.id)).orderBy(asc(tasks.done), asc(tasks.dueDate)),
    db.query.renewalOutcomes.findFirst({ where: eq(renewalOutcomes.policyId, policy.id) }),
    policy.previousPolicyId
      ? db.query.policies.findFirst({ where: and(eq(policies.id, policy.previousPolicyId), eq(policies.workspaceId, ws.id)) })
      : Promise.resolve(undefined),
    db
      .select({ id: policies.id, lineOfBusiness: policies.lineOfBusiness, carrier: policies.carrier, expiryDate: policies.expiryDate })
      .from(policies)
      .where(and(eq(policies.accountId, accountId), eq(policies.workspaceId, ws.id)))
      .orderBy(asc(policies.expiryDate)),
  ]);

  let successor: Policy | null = null;
  let successorHasOutcome = false;
  if (outcome?.successorPolicyId) {
    successor = (await db.query.policies.findFirst({ where: eq(policies.id, outcome.successorPolicyId) })) ?? null;
    if (successor) {
      const own = await db.query.renewalOutcomes.findFirst({ where: eq(renewalOutcomes.policyId, successor.id) });
      successorHasOutcome = !!own;
    }
  }

  return {
    account,
    policy,
    checklist,
    tasks: policyTasks,
    outcome: outcome ?? null,
    predecessor: predecessor ?? null,
    successor,
    successorHasOutcome,
    accountPolicies,
  };
}

/* ------------------------------------------------------------------ */
/* Account page additions                                              */
/* ------------------------------------------------------------------ */

export async function listAccountTasks(workspaceId: string, accountId: string): Promise<Task[]> {
  const db = getDb();
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.accountId, accountId)))
    .orderBy(asc(tasks.done), asc(tasks.dueDate), asc(tasks.title));
}

export async function listAccountActivities(workspaceId: string, accountId: string): Promise<Activity[]> {
  const db = getDb();
  return db
    .select()
    .from(activities)
    .where(and(eq(activities.workspaceId, workspaceId), eq(activities.accountId, accountId)))
    // Newest first on the workspace timeline (the as-of date when logged), then by real time.
    .orderBy(desc(activities.asOfDate), desc(activities.createdAt), desc(activities.id));
}

/** Policy ids on the account that have a recorded outcome, so the policies table can label them. */
export async function listOutcomePolicyIds(workspaceId: string, policyIds: string[]): Promise<Set<string>> {
  if (policyIds.length === 0) return new Set();
  const db = getDb();
  const rows = await db
    .select({ policyId: renewalOutcomes.policyId })
    .from(renewalOutcomes)
    .where(and(eq(renewalOutcomes.workspaceId, workspaceId), inArray(renewalOutcomes.policyId, policyIds)));
  return new Set(rows.map((r) => r.policyId));
}
