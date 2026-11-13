import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Missing } from "@/components/Missing";
import { MetricTile } from "@/components/dashboard/MetricTile";
import { ShowMath } from "@/components/dashboard/ShowMath";
import { ClaimsSection } from "@/components/lossRuns/ClaimsSection";
import { ImportClaimsDialog } from "@/components/lossRuns/ImportClaimsDialog";
import { LossRatioChart } from "@/components/lossRuns/LossRatioChart";
import { LossRunSettingsForm } from "@/components/lossRuns/LossRunSettingsForm";
import { adjustmentsFrom, lossRunsHref, settingsFromQuery, type LossRunQuery } from "@/components/lossRuns/params";
import { LINES_OF_BUSINESS, type LineOfBusiness } from "@/lib/constants";
import {
  CLAIM_FLAG_LABELS,
  assignPolicyYear,
  claimFlags,
  incurred,
  largeLosses,
  openClaims,
  policyPeriods,
  policyYearSummary,
  type Frequency,
  type SummaryTotal,
} from "@/lib/domain/lossRuns";
import { formatCurrency, formatDate, formatRatioPercent } from "@/lib/format";
import { loadLossRunInputs } from "@/server/lossRuns/queries";
import { requireWorkspace } from "../../../lib";

export const metadata: Metadata = { title: "Loss runs" };

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();

function freqText(f: Frequency): React.ReactNode {
  if (f.value === null) return <Missing what={`Frequency (${f.reason ?? "unavailable"})`} />;
  return f.value.toFixed(2);
}

export default async function LossRunsPage({ params, searchParams }: { params: Promise<{ slug: string; accountId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ slug, accountId }, sp] = await Promise.all([params, searchParams]);
  const ws = await requireWorkspace(slug);
  const asOf = ws.asOfDate;
  const inputs = await loadLossRunInputs(ws, accountId);
  if (!inputs) notFound();
  const { policies, claims } = inputs;

  // Lines with a policy or a claim on this account, in the standard order.
  const present = new Set<string>([...policies.map((p) => p.lineOfBusiness), ...claims.map((c) => c.lineOfBusiness)]);
  const lines = LINES_OF_BUSINESS.filter((l) => present.has(l));
  const requested = first(sp.line);
  const line: LineOfBusiness = (lines as readonly string[]).includes(requested)
    ? (requested as LineOfBusiness)
    : lines.includes("General Liability")
      ? "General Liability"
      : (lines[0] ?? "General Liability");

  const query: LossRunQuery = { line, trend: first(sp.trend), ldf: first(sp.ldf), threshold: first(sp.threshold), cap: first(sp.cap) };
  const settings = settingsFromQuery(query);
  const adjustments = adjustmentsFrom(settings.values);

  const summary = policyYearSummary({ claims, policies, line, asOf, adjustments });
  const s = summary.value;
  const periods = policyPeriods(policies, line).value;
  const flags = claimFlags(claims, policies, asOf);
  const lineClaims = claims.filter((c) => c.lineOfBusiness === line);
  const fiveYearIds = new Set(s.rows.slice(-5).map((r) => r.period.policyId));
  const fiveYearClaims = lineClaims.filter((c) => {
    const p = assignPolicyYear(c, periods).value;
    return p !== null && fiveYearIds.has(p.policyId);
  });
  const large = largeLosses(fiveYearClaims, s.total?.earnedPremium ?? 0, settings.values.threshold, settings.values.cap);
  const open = openClaims(lineClaims);
  const flagged = claims.filter((c) => (flags.value[c.id] ?? []).length > 0);

  const units = [...new Set(s.rows.map((r) => r.frequency.unit).filter(Boolean))];
  const freqHeader = units.length === 1 ? `Frequency (${units[0]})` : "Frequency";
  const basisLabel = s.adjusted
    ? `adjusted: ${[adjustments.trendRate !== null ? `trend ${formatRatioPercent(adjustments.trendRate)}` : null, adjustments.factors ? "development" : null].filter(Boolean).join(" + ")}`
    : "raw";
  const chartYears = s.rows.map((r) => {
    const amount = s.adjusted ? r.adjustedIncurred : r.incurred;
    const ratio = s.adjusted ? r.adjustedLossRatio : r.lossRatio;
    return { label: r.label, incurred: amount, lossRatioPct: ratio === null ? null : Math.round(ratio * 1000) / 10, earnedToDate: r.earnedToDate };
  });
  const policyOptions = policies.map((p) => ({
    id: p.id,
    line: p.lineOfBusiness,
    label: `PY${p.effectiveDate.slice(0, 4)}: ${p.effectiveDate} to ${p.expiryDate}`,
  }));
  const claimRows = lineClaims.map((c) => ({
    ...c,
    incurred: incurred(c.paid, c.reserved).value,
    policyYear: assignPolicyYear(c, periods).value?.label ?? null,
    flags: flags.value[c.id] ?? [],
  }));
  const active = "bg-primary/5";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Line of business">
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No policies or claims on this account yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {lines.map((l) => (
                  <li key={l}>
                    <Link
                      href={lossRunsHref(slug, accountId, query, { line: l })}
                      aria-current={l === line ? "page" : undefined}
                      className={cn(
                        "inline-flex rounded-full border px-3 py-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        l === line ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      {l}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </nav>
          <ImportClaimsDialog slug={slug} accountId={accountId} asOf={asOf} existingClaimNumbers={claims.map((c) => c.claimNumber)} />
        </div>
        {settings.invalid ? (
          <p role="alert" className="text-sm text-destructive">
            The settings in the link were not valid, so the defaults are shown.
          </p>
        ) : null}
      </div>

      {/* ---------------- Policy-year summary ---------------- */}
      <section aria-labelledby="summary-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="summary-heading" className="text-lg font-semibold">
            {line}: policy-year summary
          </h2>
          <Badge variant={s.adjusted ? "default" : "outline"} className="text-sm">
            Active basis: {basisLabel}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Each claim belongs to the policy period that contains its date of loss. The running year&apos;s premium is earned to date ({formatDate(asOf)}). Totals and averages
          cover the five most recent policy years.
          {s.excludedOutsidePeriod > 0 ? ` ${s.excludedOutsidePeriod} claim${s.excludedOutsidePeriod === 1 ? " is" : "s are"} outside known policy periods and excluded until fixed.` : ""}
        </p>

        {s.rows.length === 0 ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">
            No {line} policy periods start on or before the as-of date, so there are no policy years to summarise.
          </p>
        ) : (
          <>
            <div className="rounded-lg border p-3">
              <LossRatioChart years={chartYears} basisLabel={s.adjusted ? "adjusted" : "raw"} />
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <caption className="sr-only">Policy-year summary for {line}; active basis {basisLabel}</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Policy year</TableHead>
                    <TableHead className="text-right">Claims</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className={cn("text-right", !s.adjusted && active)}>Incurred{!s.adjusted ? " (active)" : " (raw)"}</TableHead>
                    <TableHead className="text-right">Earned premium</TableHead>
                    <TableHead className={cn("text-right", !s.adjusted && active)}>Loss ratio{s.adjusted ? " (raw)" : ""}</TableHead>
                    <TableHead className="text-right whitespace-normal">{freqHeader}</TableHead>
                    <TableHead className="text-right">Severity</TableHead>
                    {s.adjusted ? (
                      <>
                        <TableHead className="text-right">Trend</TableHead>
                        <TableHead className="text-right">Age / factor</TableHead>
                        <TableHead className={cn("text-right", active)}>Adjusted incurred (active)</TableHead>
                        <TableHead className={cn("text-right", active)}>Adjusted loss ratio</TableHead>
                      </>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.rows.map((r) => (
                    <TableRow key={r.period.policyId}>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-medium">{r.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.period.effectiveDate} to {r.period.expiryDate}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.claimCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.openCount}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(r.paid)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(r.reserved)}</TableCell>
                      <TableCell className={cn("text-right font-medium tabular-nums", !s.adjusted && active)}>{formatCurrency(r.incurred)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(r.earnedPremium)}
                        {r.earnedToDate ? <span className="block text-xs text-muted-foreground">earned to date</span> : null}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", !s.adjusted && active)}>
                        {r.lossRatio === null ? <Missing what="Loss ratio (no earned premium)" /> : formatRatioPercent(r.lossRatio)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{freqText(r.frequency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.severity === null ? <Missing what="Severity (no claims)" /> : formatCurrency(r.severity)}</TableCell>
                      {s.adjusted ? (
                        <>
                          <TableCell className="text-right whitespace-nowrap tabular-nums">
                            {r.trendExponent === null ? "off" : `× ${r.trendFactor.toFixed(4)}`}
                            {r.trendExponent !== null ? <span className="block text-xs text-muted-foreground">exponent {r.trendExponent}</span> : null}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap tabular-nums">
                            {adjustments.factors ? `× ${r.developmentFactor.toFixed(2)}` : "off"}
                            <span className="block text-xs text-muted-foreground">
                              {r.ageMonths} mo → {r.ageBucket}
                            </span>
                          </TableCell>
                          <TableCell className={cn("text-right font-medium tabular-nums", active)}>{formatCurrency(r.adjustedIncurred)}</TableCell>
                          <TableCell className={cn("text-right tabular-nums", active)}>
                            {r.adjustedLossRatio === null ? <Missing what="Adjusted loss ratio (no earned premium)" /> : formatRatioPercent(r.adjustedLossRatio)}
                          </TableCell>
                        </>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
                {s.total && s.average ? (
                  <TableFooter>
                    <TotalRow t={s.total} adjusted={s.adjusted} active={active} isAverage={false} />
                    <TotalRow t={s.average} adjusted={s.adjusted} active={active} isAverage />
                  </TableFooter>
                ) : null}
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              Loss ratio = incurred ÷ earned premium. Frequency = claims per exposure unit. Severity = incurred ÷ claims. On the average row, loss ratio, frequency and severity
              are the five-year aggregates.
            </p>
            <ShowMath lines={summary.math.steps.lines as string[]} />
          </>
        )}
      </section>

      <LossRunSettingsForm key={JSON.stringify(settings.input)} slug={slug} accountId={accountId} line={line} current={settings.input} prospectiveYear={s.prospectiveYear} />

      {/* ---------------- Large loss ---------------- */}
      <section aria-labelledby="large-heading" className="flex flex-col gap-3">
        <h2 id="large-heading" className="text-lg font-semibold">
          Large losses, {formatCurrency(large.value.threshold)} and above
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricTile
            label="Large losses"
            value={fiveYearClaims.length ? `${large.value.rows.length}` : null}
            missing="Large losses (no claims in the five years)"
            detail={
              <>
                {formatCurrency(large.value.largeIncurred)} of {formatCurrency(large.value.totalIncurred)} five-year incurred
                {large.value.totalIncurred > 0 ? ` (${formatRatioPercent(large.value.largeIncurred / large.value.totalIncurred)})` : ""}
              </>
            }
            lines={large.math.steps.lines as string[]}
          />
          <MetricTile
            label="Five-year loss ratio"
            value={formatRatioPercent(large.value.lossRatio)}
            missing="Loss ratio (no earned premium)"
            detail={
              <>
                {formatCurrency(large.value.totalIncurred)} incurred ÷ {formatCurrency(large.value.earnedPremium)} earned (raw)
              </>
            }
            lines={large.math.steps.lines as string[]}
          />
          <MetricTile
            label={`Capped loss ratio (cap ${formatCurrency(large.value.cap)})`}
            value={formatRatioPercent(large.value.cappedLossRatio)}
            missing="Capped loss ratio (no earned premium)"
            detail={
              <>
                {formatCurrency(large.value.cappedIncurred)} capped incurred ÷ {formatCurrency(large.value.earnedPremium)} earned
              </>
            }
            lines={large.math.steps.lines as string[]}
          />
        </div>
        {large.value.rows.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim</TableHead>
                  <TableHead>Date of loss</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Incurred</TableHead>
                  <TableHead className="text-right">Share of incurred</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {large.value.rows.map((r) => (
                  <TableRow key={r.claim.id}>
                    <TableCell className="font-medium">{r.claim.claimNumber}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(r.claim.dateOfLoss)}</TableCell>
                    <TableCell className="min-w-48 whitespace-normal">{r.claim.description ?? <Missing what="Description" />}</TableCell>
                    <TableCell>{r.claim.status === "open" ? "Open" : "Closed"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(r.incurred)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatRatioPercent(r.share)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </section>

      {/* ---------------- Open claims ---------------- */}
      <section aria-labelledby="open-heading" className="flex flex-col gap-3">
        <h2 id="open-heading" className="text-lg font-semibold">
          Open claims
        </h2>
        <p className="text-sm">
          {open.value.rows.length} open {open.value.rows.length === 1 ? "claim" : "claims"} carrying {formatCurrency(open.value.totalOpenReserves)} in reserves
          {open.value.reservedShare === null ? "." : `, ${formatRatioPercent(open.value.reservedShare)} of ${formatCurrency(open.value.totalIncurred)} total ${line} incurred.`}
        </p>
        {open.value.rows.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim</TableHead>
                  <TableHead>Date of loss</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {open.value.rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.claimNumber}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(c.dateOfLoss)}</TableCell>
                    <TableCell className="min-w-48 whitespace-normal">{c.description ?? <Missing what="Description" />}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.paid)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatCurrency(c.reserved)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
        <ShowMath lines={open.math.steps.lines as string[]} />
      </section>

      {/* ---------------- Data quality ---------------- */}
      <section aria-labelledby="quality-heading" className="flex flex-col gap-3">
        <h2 id="quality-heading" className="text-lg font-semibold">
          Data quality
        </h2>
        {flagged.length === 0 ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">No claims on this account are flagged.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {flagged.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <span className="font-medium">{c.claimNumber}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {c.lineOfBusiness} · loss {formatDate(c.dateOfLoss)}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1">
                  {(flags.value[c.id] ?? []).map((f) => (
                    <Badge key={f} variant="outline" className="gap-1 border-amber-500/60 font-normal">
                      <AlertTriangle className="size-3" aria-hidden="true" />
                      {CLAIM_FLAG_LABELS[f]}
                    </Badge>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ClaimsSection
        slug={slug}
        accountId={accountId}
        asOf={asOf}
        line={line}
        claims={claimRows}
        policyOptions={policyOptions}
        claimNumbers={claims.map((c) => ({ id: c.id, number: c.claimNumber }))}
      />
    </div>
  );
}

function TotalRow({ t, adjusted, active, isAverage }: { t: SummaryTotal; adjusted: boolean; active: string; isAverage: boolean }) {
  const n = (x: number) => (isAverage ? x.toFixed(1) : String(x));
  return (
    <TableRow>
      <TableHead scope="row" className="whitespace-normal font-semibold">
        {t.label}
      </TableHead>
      <TableCell className="text-right tabular-nums">{n(t.claimCount)}</TableCell>
      <TableCell className="text-right tabular-nums">{n(t.openCount)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(t.paid)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(t.reserved)}</TableCell>
      <TableCell className={cn("text-right font-semibold tabular-nums", !adjusted && active)}>{formatCurrency(t.incurred)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(t.earnedPremium)}</TableCell>
      <TableCell className={cn("text-right tabular-nums", !adjusted && active)}>{t.lossRatio === null ? <Missing what="Loss ratio (no earned premium)" /> : formatRatioPercent(t.lossRatio)}</TableCell>
      <TableCell className="text-right tabular-nums">{freqText(t.frequency)}</TableCell>
      <TableCell className="text-right tabular-nums">{t.severity === null ? <Missing what="Severity (no claims)" /> : formatCurrency(t.severity)}</TableCell>
      {adjusted ? (
        <>
          <TableCell />
          <TableCell />
          <TableCell className={cn("text-right font-semibold tabular-nums", active)}>{formatCurrency(t.adjustedIncurred)}</TableCell>
          <TableCell className={cn("text-right tabular-nums", active)}>
            {t.adjustedLossRatio === null ? <Missing what="Adjusted loss ratio" /> : formatRatioPercent(t.adjustedLossRatio)}
          </TableCell>
        </>
      ) : null}
    </TableRow>
  );
}
