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
import { layersFor, loadPolicyExtras, loadProgramLayers } from "@/server/program/queries";
import { loadLossRunInputs } from "@/server/lossRuns/queries";
import { listPolicyDocuments } from "@/server/documents/queries";
import { blobReady } from "@/server/documents/blob";
import { certificateInsurers, toCertificatePolicy } from "@/server/certificates/queries";
import { CertificatesPanel } from "@/components/policy/CertificatesPanel";
import { DocumentsFolder } from "@/components/documents/DocumentsFolder";
import { ShowMath } from "@/components/dashboard/ShowMath";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { assignPolicyYear, incurred, policyPeriods, policyYearSummary } from "@/lib/domain/lossRuns";
import { analyzeTower, layerSummary, towerInputsFrom } from "@/lib/domain/program";
import { formatRatioPercent } from "@/lib/format";
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
  const [extras, deductibleRows, losses, program, policyDocs, insurers] = await Promise.all([
    loadPolicyExtras(ws.id, policy.id),
    listPolicyDeductibles(ws.id, policy.id),
    loadLossRunInputs(ws, account.id),
    loadProgramLayers(ws.id, account.id),
    listPolicyDocuments(ws, policy.id, accountPolicies),
    certificateInsurers(ws.id, policy),
  ]);
  const prefill = null;
  // v1.4: claims under this policy (by the term that contains their loss date) with the line's policy-year summary.
  const periods = losses ? policyPeriods(losses.policies, policy.lineOfBusiness).value : [];
  const policyClaims = losses ? losses.claims.filter((c) => c.lineOfBusiness === policy.lineOfBusiness && assignPolicyYear(c, periods).value?.policyId === policy.id) : [];
  const lineSummary = losses ? policyYearSummary({ claims: losses.claims, policies: losses.policies, line: policy.lineOfBusiness, asOf: ws.asOfDate, adjustments: { trendRate: null, factors: null } }) : null;
  const group = policy.lineOfBusiness === "General Liability" ? "gl" : policy.lineOfBusiness === "Commercial Auto" ? "auto" : policy.lineOfBusiness === "Property" ? "property" : null;
  const groupLayers = group ? layersFor(program, group) : [];
  const towerAnalysis = groupLayers.length ? analyzeTower(towerInputsFrom(groupLayers)) : null;
  const superseded = new Set(accountPolicies.map((p) => p.previousPolicyId).filter((x): x is string => x !== null));
  const otherInForce = accountPolicies.filter((p) => p.id !== policy.id && !superseded.has(p.id) && p.effectiveDate <= ws.asOfDate && ws.asOfDate < p.expiryDate && p.renewalStatus !== "lost" && p.renewalStatus !== "non_renewed");
  const certificateRows = policyDocs
    .filter((d) => d.docType === "certificate")
    .map((d) => ({ id: d.id, title: d.title, policyYear: d.policyYear, status: d.status, markets: d.markets, policyLabel: d.policyLabel, fileName: d.fileName, sizeBytes: d.sizeBytes, uploadedAt: d.uploadedAt.toISOString(), isSeed: d.isSeed, reissueNeeded: d.reissueNeeded, reissueReason: d.reissueReason, notes: d.notes }));
  const otherDocRows = policyDocs
    .filter((d) => d.docType !== "certificate")
    .map((d) => ({ id: d.id, title: d.title, policyYear: d.policyYear, status: d.status, markets: d.markets, policyLabel: d.policyLabel, fileName: d.fileName, sizeBytes: d.sizeBytes, uploadedAt: d.uploadedAt.toISOString(), isSeed: d.isSeed, reissueNeeded: false, reissueReason: null, notes: d.notes }));

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

      <section aria-labelledby="policy-claims-heading" className="flex flex-col gap-3">
        <h2 id="policy-claims-heading" className="text-lg font-semibold">
          Claims under this policy
          <span className="ml-2 text-sm font-normal text-muted-foreground">{policyClaims.length} in this term</span>
        </h2>
        {policyClaims.length === 0 ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">No claims fall in this policy&apos;s term.</p>
        ) : (
          <div className="relative overflow-x-auto rounded-lg border">
            <Table>
              <caption className="sr-only">Claims whose loss date falls in this term</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim</TableHead>
                  <TableHead>Date of loss</TableHead>
                  <TableHead>Peril</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Paid ($)</TableHead>
                  <TableHead className="text-right">Reserved ($)</TableHead>
                  <TableHead className="text-right">Incurred ($)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policyClaims.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.claimNumber}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(c.dateOfLoss)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{c.peril || "All other perils"}</TableCell>
                    <TableCell className="min-w-48 whitespace-normal">{c.description ?? <Missing what="Description" />}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.paid)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.reserved)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrency(incurred(c.paid, c.reserved).value)}</TableCell>
                    <TableCell>{c.status === "open" ? "Open" : "Closed"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {lineSummary && lineSummary.value.rows.length > 0 ? (
          <>
            <h3 className="text-sm font-medium">{policy.lineOfBusiness} policy-year summary (raw)</h3>
            <div className="relative overflow-x-auto rounded-lg border">
              <Table>
                <caption className="sr-only">Policy-year summary for the line</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Policy year</TableHead>
                    <TableHead className="text-right">Claims</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Incurred ($)</TableHead>
                    <TableHead className="text-right">Earned premium ($)</TableHead>
                    <TableHead className="text-right">Loss ratio (%)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineSummary.value.rows.map((r) => (
                    <TableRow key={r.period.policyId} className={r.period.policyId === policy.id ? "bg-primary/5" : undefined}>
                      <TableCell className="whitespace-nowrap">
                        {r.label}
                        {r.period.policyId === policy.id ? <span className="ml-1 text-xs text-muted-foreground">(this term)</span> : null}
                        {r.current ? <span className="ml-1 text-xs text-muted-foreground">running</span> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.claimCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.openCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(r.incurred)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(r.earnedPremium)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.lossRatio === null ? <Missing what="Loss ratio (no earned premium)" /> : formatRatioPercent(r.lossRatio)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ShowMath lines={lineSummary.math.steps.lines as string[]} />
          </>
        ) : null}
        <Link href={`${base}/loss-runs?line=${encodeURIComponent(policy.lineOfBusiness)}`} className="w-fit text-sm underline-offset-4 hover:underline">
          Open the Loss Runs tab for {policy.lineOfBusiness}
        </Link>
      </section>

      <section aria-labelledby="policy-program-heading" className="flex flex-col gap-3">
        <h2 id="policy-program-heading" className="text-lg font-semibold">
          Program layers in this line group
        </h2>
        {group === null ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">{policy.lineOfBusiness} is not part of a program group (General Liability, Commercial Auto or Property).</p>
        ) : groupLayers.length === 0 ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">No layers recorded for this group yet.</p>
        ) : (
          <>
            <div className="relative overflow-x-auto rounded-lg border">
              <Table>
                <caption className="sr-only">Program layers</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tower</TableHead>
                    <TableHead>Layer</TableHead>
                    <TableHead>Insurers (signed line)</TableHead>
                    <TableHead className="text-right">Attachment ($)</TableHead>
                    <TableHead className="text-right">Limit ($)</TableHead>
                    <TableHead className="text-right">Placed (%)</TableHead>
                    <TableHead className="text-right">Premium ($)</TableHead>
                    <TableHead className="text-right">Rate on line (%)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupLayers.map((l) => {
                    const s = layerSummary(l).value;
                    return (
                      <TableRow key={l.id} className={l.policyId === policy.id ? "bg-primary/5" : undefined}>
                        <TableCell>{l.towerLabel}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {s.label}
                          {l.policyId === policy.id ? <span className="ml-1 text-xs text-muted-foreground">(this policy)</span> : null}
                        </TableCell>
                        <TableCell className="min-w-48 whitespace-normal text-xs">{l.participations.map((x) => `${x.insurer} ${x.signedLinePct}%`).join(" · ") || "Unplaced"}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(l.attachment)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(l.limit)}</TableCell>
                        <TableCell className="text-right tabular-nums">{(s.placedShare * 100).toFixed(1)}%</TableCell>
                        <TableCell className="text-right tabular-nums">{formatCurrency(s.layerPremium)}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.rateOnLine === null ? "—" : `${(s.rateOnLine * 100).toFixed(4)}%`}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {towerAnalysis ? <ShowMath lines={towerAnalysis.math.steps.lines as string[]} /> : null}
            <Link href={`${base}/program?group=${group}`} className="w-fit text-sm underline-offset-4 hover:underline">
              Open the Program tab
            </Link>
          </>
        )}
      </section>

      <CertificatesPanel
        slug={slug}
        accountId={account.id}
        asOf={ws.asOfDate}
        namedInsured={{ name: account.name, province: account.province, industry: account.industry }}
        policy={toCertificatePolicy(policy)}
        insurers={insurers}
        otherPolicies={otherInForce.map(toCertificatePolicy)}
        certificates={certificateRows}
        blobReady={blobReady()}
      />

      {otherDocRows.length > 0 ? (
        <section aria-labelledby="policy-docs-heading" className="flex flex-col gap-3">
          <h2 id="policy-docs-heading" className="text-lg font-semibold">
            Documents linked to this policy
          </h2>
          <DocumentsFolder slug={slug} accountId={account.id} folder="policy_document" rows={otherDocRows} policyYears={[]} insurers={[]} policies={[]} canUpload={false} />
        </section>
      ) : null}

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
