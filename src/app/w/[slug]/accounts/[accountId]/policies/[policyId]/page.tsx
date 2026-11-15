import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DaysBadge } from "@/components/book/BookTable";
import { Missing, ValueOrMissing } from "@/components/Missing";
import { ChecklistPanel } from "@/components/policy/ChecklistPanel";
import { OutcomePanel } from "@/components/policy/OutcomePanel";
import { RateChangePanel } from "@/components/policy/RateChangePanel";
import { StageBadge } from "@/components/renewals/StageBadge";
import { TasksSection } from "@/components/tasks/TasksSection";
import { ENDORSEMENT_LABELS, EXPOSURE_BASIS_LABELS, RENEWAL_STATUS_LABELS } from "@/lib/constants";
import { daysBetween } from "@/lib/domain/dates";
import { commissionAmount, formatLimit } from "@/lib/domain/money";
import { getRenewalStage } from "@/lib/domain/renewals";
import { formatCurrency, formatDate, formatInteger, formatPercent } from "@/lib/format";
import { getPolicyPageData } from "@/server/renewals/queries";
import { loadPolicyExtras } from "@/server/program/queries";
import { boundQuoteForPolicy } from "@/server/marketing/queries";
import { AdequacyPanel } from "@/components/program/AdequacyPanel";
import { ParticipantsSection } from "@/components/program/ParticipantsSection";
import { SublimitsSection } from "@/components/program/SublimitsSection";
import { DeductibleScheduleSection } from "@/components/policy/DeductibleScheduleSection";
import { listPolicyDeductibles } from "@/server/deductibles/queries";
import { requireWorkspace } from "../../../../lib";

type Params = Promise<{ slug: string; accountId: string; policyId: string }>;

export const metadata: Metadata = { title: "Policy" };

export default async function PolicyPage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug, accountId, policyId }, sp] = await Promise.all([params, searchParams]);
  const ws = await requireWorkspace(slug);
  const data = await getPolicyPageData(ws, accountId, policyId);
  if (!data) notFound();
  const { account, policy, checklist, tasks, outcome, predecessor, successor, successorHasOutcome, accountPolicies } = data;
  const [extras, bound, deductibleRows] = await Promise.all([loadPolicyExtras(ws.id, policy.id), boundQuoteForPolicy(ws.id, policy.id), listPolicyDeductibles(ws.id, policy.id)]);
  const prefill = bound
    ? {
        carrier: bound.carrier,
        premium: bound.quote.quotedPremium,
        exposureAmount: bound.quote.exposureAmount,
        deductible: bound.quote.deductible,
        occurrenceLimit: bound.quote.occurrenceLimit,
        aggregateLimit: bound.quote.aggregateLimit,
        commissionRate: bound.quote.commissionRate,
      }
    : null;

  const days = daysBetween(ws.asOfDate, policy.expiryDate).value;
  const stage = getRenewalStage(days, policy.renewalStatus).value;
  const limit = formatLimit(policy.occurrenceLimit, policy.aggregateLimit);
  const commission = commissionAmount(policy.annualPremium, policy.commissionRate);
  const base = `/w/${slug}/accounts/${account.id}`;
  const label = (p: { lineOfBusiness: string; carrier: string; expiryDate: string }) => `${p.lineOfBusiness} · ${p.carrier} · expires ${formatDate(p.expiryDate)}`;
  const exposure =
    policy.exposureAmount === null
      ? null
      : policy.exposureBasis === "revenue" || policy.exposureBasis === "payroll"
        ? formatCurrency(policy.exposureAmount)
        : formatInteger(policy.exposureAmount);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href={base} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {account.name}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {policy.lineOfBusiness} · {policy.carrier}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{policy.policyNumber ?? "No policy number"}</span>
              <span aria-hidden="true">·</span>
              <StageBadge stage={stage} />
              <Badge variant="outline">{RENEWAL_STATUS_LABELS[policy.renewalStatus]}</Badge>
              <DaysBadge days={days} />
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`${base}/policies/${policy.id}/edit`}>
              <Pencil aria-hidden="true" />
              Edit policy
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Term">
              {formatDate(policy.effectiveDate)} to {formatDate(policy.expiryDate)}
            </Fact>
            <Fact label="Annual premium">{formatCurrency(policy.annualPremium)}</Fact>
            <Fact label="Commission">
              {formatCurrency(commission.value)} ({formatPercent(policy.commissionRate)})
            </Fact>
            <Fact label="Limits">
              {(limit.math.steps.missing as string[]).length === 2 ? <Missing what="Occurrence and aggregate limits" /> : limit.value}
            </Fact>
            <Fact label="Deductible">
              <ValueOrMissing text={formatCurrency(policy.deductible)} what="Deductible" />
            </Fact>
            <Fact label={`Exposure (${EXPOSURE_BASIS_LABELS[policy.exposureBasis].toLowerCase()})`}>
              <ValueOrMissing text={exposure} what="Exposure amount" />
            </Fact>
            <Fact label="Endorsements">
              {policy.endorsements.length === 0 ? "None" : policy.endorsements.map((e) => ENDORSEMENT_LABELS[e]).join(", ")}
            </Fact>
            <Fact label="Previous term">
              {predecessor ? (
                <Link href={`${base}/policies/${predecessor.id}`} className="underline-offset-4 hover:underline">
                  {predecessor.carrier}, expired {formatDate(predecessor.expiryDate)}
                </Link>
              ) : (
                "None on file"
              )}
            </Fact>
          </dl>
        </CardContent>
      </Card>

      <OutcomePanel
        slug={slug}
        prefill={prefill}
        autoOpen={sp.outcome === "renewed"}
        policy={{
          id: policy.id,
          carrier: policy.carrier,
          expiryDate: policy.expiryDate,
          annualPremium: policy.annualPremium,
          exposureAmount: policy.exposureAmount,
          exposureBasis: policy.exposureBasis,
          deductible: policy.deductible,
          occurrenceLimit: policy.occurrenceLimit,
          aggregateLimit: policy.aggregateLimit,
          commissionRate: policy.commissionRate,
        }}
        outcome={
          outcome
            ? {
                outcome: outcome.outcome,
                lostReason: outcome.lostReason,
                reason: outcome.reason,
                competingPremium: outcome.competingPremium,
                recordedAsOf: outcome.recordedAsOf,
                priorStatusLabel: RENEWAL_STATUS_LABELS[outcome.priorStatus],
                successor: successor ? { href: `${base}/policies/${successor.id}`, label: label(successor) } : null,
                successorHasOutcome,
              }
            : null
        }
      />

      {successor ? (
        <RateChangePanel
          title="This term vs its renewal"
          expiring={policy}
          renewal={successor}
          otherHref={`${base}/policies/${successor.id}`}
          otherLabel="Open the renewal policy"
        />
      ) : null}
      {predecessor ? (
        <RateChangePanel
          title="Prior term vs this term"
          expiring={predecessor}
          renewal={policy}
          otherHref={`${base}/policies/${predecessor.id}`}
          otherLabel="Open the prior term"
        />
      ) : null}

      <ChecklistPanel
        slug={slug}
        policyId={policy.id}
        items={checklist.map((c) => ({ id: c.id, label: c.label, required: c.required, done: c.done, source: c.source }))}
      />

      <TasksSection
        slug={slug}
        accountId={account.id}
        asOf={ws.asOfDate}
        policyId={policy.id}
        defaultOwner={account.accountManager ?? account.producer}
        tasks={tasks.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, owner: t.owner, done: t.done, policyId: t.policyId }))}
        policyOptions={accountPolicies.map((p) => ({ id: p.id, label: label(p) }))}
      />

      {policy.lineOfBusiness === "Property" ? (
        <AdequacyPanel defaults={{ insurableValue: policy.insurableValue, coinsurancePercent: policy.coinsurancePercent, carriedLimit: policy.occurrenceLimit, deductible: policy.deductible }} />
      ) : null}

      <ParticipantsSection
        slug={slug}
        policyId={policy.id}
        policyCarrier={policy.carrier}
        policyPremium={policy.annualPremium}
        occurrenceLimit={policy.occurrenceLimit}
        rows={extras.participants.map((p) => ({ id: p.id, carrier: p.carrier, role: p.role, signedLine: p.signedLine, premium: p.premium, notes: p.notes }))}
      />

      <DeductibleScheduleSection slug={slug} policyId={policy.id} policyDeductible={policy.deductible} rows={deductibleRows} />
      <SublimitsSection
        slug={slug}
        policyId={policy.id}
        policyLimit={policy.occurrenceLimit}
        policyDeductible={policy.deductible}
        rows={extras.sublimits.map((s) => ({ id: s.id, name: s.name, limit: s.limit, deductible: s.deductible, notes: s.notes }))}
      />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
