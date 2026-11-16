import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InfoTip } from "@/components/InfoTip";
import { Missing } from "@/components/Missing";
import { MetricTile } from "@/components/dashboard/MetricTile";
import { ShowMath } from "@/components/dashboard/ShowMath";
import { ClaimsSection } from "@/components/lossRuns/ClaimsSection";
import { ImportClaimsDialog } from "@/components/lossRuns/ImportClaimsDialog";
import { LossRatioChart } from "@/components/lossRuns/LossRatioChart";
import { LossRunSettingsForm } from "@/components/lossRuns/LossRunSettingsForm";
import { adjustmentsFrom, lossRunsHref, settingsFromQuery, type LossRunQuery } from "@/components/lossRuns/params";
import { LINES_OF_BUSINESS, type LineOfBusiness } from "@/lib/constants";
import { assignPolicyYear, claimFlags, groupPolicyYears, incurred, largeLosses, openClaims, policyPeriods, policyYearSummary, type Frequency, type SummaryRow, type SummaryTotal } from "@/lib/domain/lossRuns";
import { formatCurrency, formatDate, formatRatioPercent } from "@/lib/format";
import { loadLossRunInputs } from "@/server/lossRuns/queries";
import { requireWorkspace } from "../../../../lib";

export const metadata: Metadata = { title: "Loss runs" };

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
/** Rows shown per group before "Show N more" (v1.5). */
const GROUP_PREVIEW = 3;

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

  const query: LossRunQuery = { line, trend: first(sp.trend), ldf: first(sp.ldf), threshold: first(sp.threshold), cap: first(sp.cap), active: first(sp.active) === "all" ? "all" : "", expired: first(sp.expired) === "all" ? "all" : "" };
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
  const groups = groupPolicyYears(s.rows, asOf, inputs.policyStatus);

  const units = [...new Set(s.rows.map((r) => r.frequency.unit).filter(Boolean))];
  const freqHeader = units.length === 1 ? `Frequency (${units[0]})` : "Frequency";
  const basisLabel = s.adjusted
    ? `adjusted: ${[adjustments.trendRate !== null ? `trend ${formatRatioPercent(adjustments.trendRate)}` : null, adjustments.factors ? "development" : null].filter(Boolean).join(" + ")}`
    : "raw incurred";
  const chartYears = s.rows.map((r) => {
    const amount = s.adjusted ? r.adjustedIncurred : r.incurred;
    const ratio = s.adjusted ? r.adjustedLossRatio : r.lossRatio;
    return { label: r.label, incurred: amount, lossRatioPct: ratio === null ? null : Math.round(ratio * 1000) / 10, earnedToDate: r.earnedToDate };
  });
  const policyOptions = policies.map((p) => ({
    id: p.id,
    line: p.lineOfBusiness,
    label: `PY${p.effectiveDate.slice(0, 4)}: ${formatDate(p.effectiveDate)} to ${formatDate(p.expiryDate)}`,
  }));
  const claimRows = lineClaims.map((c) => ({
    ...c,
    incurred: incurred(c.paid, c.reserved).value,
    policyYear: assignPolicyYear(c, periods).value?.label ?? null,
    flags: flags.value[c.id] ?? [],
  }));
  const active = "bg-primary/5";
  const columnCount = 10 + (s.adjusted ? 4 : 0);
  const groupDefs = [
    { key: "active" as const, title: "Active and in progress", rows: groups.value.active, expanded: query.active === "all" },
    { key: "expired" as const, title: "Expired", rows: groups.value.expired, expanded: query.expired === "all" },
  ];

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
                      href={lossRunsHref(slug, accountId, query, { line: l, active: "", expired: "" })}
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
          <h2 id="summary-heading" className="flex items-center gap-1.5 text-lg font-semibold">
            {line}: policy years
            <InfoTip label="About the policy-year summary">
              Each claim belongs to the policy year whose term contains its date of loss. The current year&apos;s premium is earned to {formatDate(asOf)}. Totals and averages cover the five most recent
              policy years. Active and in progress means in force at {formatDate(asOf)} or in a renewal stage with no outcome yet; Expired means expired or closed.
            </InfoTip>
          </h2>
          <Badge variant={s.adjusted ? "default" : "outline"} className="text-sm">
            Basis: {basisLabel}
          </Badge>
        </div>
        {s.excludedOutsidePeriod > 0 ? (
          <p className="text-xs text-amber-900" role="status">
            {s.excludedOutsidePeriod} claim{s.excludedOutsidePeriod === 1 ? " is" : "s are"} outside known policy periods and excluded until fixed.
          </p>
        ) : null}

        {s.rows.length === 0 ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">
            No {line} policy periods start on or before {formatDate(asOf)}, so there are no policy years to summarise.
          </p>
        ) : (
          <>
            <div className="rounded-lg border p-3">
              <LossRatioChart years={chartYears} basisLabel={s.adjusted ? "adjusted" : "raw"} />
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <caption className="sr-only">
                  Policy-year summary for {line}; basis {basisLabel}; grouped into Active and in progress and Expired
                </caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Policy year</TableHead>
                    <TableHead className="text-right">Claims</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Paid ($)</TableHead>
                    <TableHead className="text-right">Reserved ($)</TableHead>
                    <TableHead className={cn("text-right", !s.adjusted && active)}>Incurred ($){!s.adjusted ? ", in use" : ", raw"}</TableHead>
                    <TableHead className="text-right">Earned premium ($)</TableHead>
                    <TableHead className={cn("text-right", !s.adjusted && active)}>Loss ratio (%){s.adjusted ? ", raw" : ""}</TableHead>
                    <TableHead className="text-right whitespace-normal">{freqHeader}</TableHead>
                    <TableHead className="text-right">Severity ($)</TableHead>
                    {s.adjusted ? (
                      <>
                        <TableHead className="text-right">Trend</TableHead>
                        <TableHead className="text-right">Age / factor</TableHead>
                        <TableHead className={cn("text-right", active)}>Adjusted incurred ($), in use</TableHead>
                        <TableHead className={cn("text-right", active)}>Adjusted loss ratio (%)</TableHead>
                      </>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupDefs.map((g) => {
                    const visible = g.expanded ? g.rows : g.rows.slice(0, GROUP_PREVIEW);
                    const hidden = g.rows.length - visible.length;
                    return [
                      <TableRow key={`${g.key}-head`} className="bg-muted/40 hover:bg-muted/40">
                        <TableHead scope="rowgroup" colSpan={columnCount} className="h-9 font-semibold" id={`group-${g.key}`}>
                          {g.title} ({g.rows.length})
                        </TableHead>
                      </TableRow>,
                      ...(g.rows.length === 0
                        ? [
                            <TableRow key={`${g.key}-empty`}>
                              <TableCell colSpan={columnCount} className="text-sm text-muted-foreground">
                                {g.key === "active" ? "No policy year is in force or in a renewal stage." : "No expired or closed policy years."}
                              </TableCell>
                            </TableRow>,
                          ]
                        : visible.map((r) => <SummaryRowView key={r.period.policyId} r={r} adjusted={s.adjusted} active={active} factorsOn={adjustments.factors !== null} />)),
                      ...(hidden > 0 || (g.expanded && g.rows.length > GROUP_PREVIEW)
                        ? [
                            <TableRow key={`${g.key}-more`}>
                              <TableCell colSpan={columnCount} className="py-1.5">
                                <Link
                                  href={lossRunsHref(slug, accountId, query, { [g.key]: g.expanded ? "" : "all" })}
                                  scroll={false}
                                  aria-describedby={`group-${g.key}`}
                                  className="inline-flex rounded-sm text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                                >
                                  {g.expanded ? `Show ${g.rows.length - GROUP_PREVIEW} fewer` : `Show ${hidden} more`}
                                </Link>
                              </TableCell>
                            </TableRow>,
                          ]
                        : []),
                    ];
                  })}
                </TableBody>
                {s.total && s.average ? (
                  <TableFooter>
                    <TotalRow t={s.total} adjusted={s.adjusted} active={active} isAverage={false} />
                    <TotalRow t={s.average} adjusted={s.adjusted} active={active} isAverage />
                  </TableFooter>
                ) : null}
              </Table>
            </div>
            <ShowMath lines={[...(summary.math.steps.lines as string[]), ...(groups.math.steps.lines as string[])]} />
          </>
        )}
      </section>

      <LossRunSettingsForm key={JSON.stringify(settings.input)} slug={slug} accountId={accountId} line={line} current={settings.input} prospectiveYear={s.prospectiveYear} keep={{ active: query.active, expired: query.expired }} asOfLabel={formatDate(asOf) ?? asOf} />

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
                  <TableHead className="text-right">Incurred ($)</TableHead>
                  <TableHead className="text-right">Share of incurred (%)</TableHead>
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
                  <TableHead className="text-right">Paid ($)</TableHead>
                  <TableHead className="text-right">Reserved ($)</TableHead>
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

function SummaryRowView({ r, adjusted, active, factorsOn }: { r: SummaryRow; adjusted: boolean; active: string; factorsOn: boolean }) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        <span className="font-medium">{r.label}</span>
        {r.current ? (
          <Badge variant="outline" className="ml-2">
            current year
          </Badge>
        ) : null}
        <span className="block text-xs text-muted-foreground">
          {formatDate(r.period.effectiveDate)} to {formatDate(r.period.expiryDate)}
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">{r.claimCount}</TableCell>
      <TableCell className="text-right tabular-nums">{r.openCount}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(r.paid)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(r.reserved)}</TableCell>
      <TableCell className={cn("text-right font-medium tabular-nums", !adjusted && active)}>{formatCurrency(r.incurred)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {formatCurrency(r.earnedPremium)}
        {r.earnedToDate ? <span className="block text-xs text-muted-foreground">earned to date</span> : null}
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", !adjusted && active)}>{r.lossRatio === null ? <Missing what="Loss ratio (no earned premium)" /> : formatRatioPercent(r.lossRatio)}</TableCell>
      <TableCell className="text-right tabular-nums">{freqText(r.frequency)}</TableCell>
      <TableCell className="text-right tabular-nums">{r.severity === null ? <Missing what="Severity (no claims)" /> : formatCurrency(r.severity)}</TableCell>
      {adjusted ? (
        <>
          <TableCell className="text-right whitespace-nowrap tabular-nums">
            {r.trendExponent === null ? "off" : `× ${r.trendFactor.toFixed(4)}`}
            {r.trendExponent !== null ? <span className="block text-xs text-muted-foreground">exponent {r.trendExponent}</span> : null}
          </TableCell>
          <TableCell className="text-right whitespace-nowrap tabular-nums">
            {factorsOn ? `× ${r.developmentFactor.toFixed(2)}` : "off"}
            <span className="block text-xs text-muted-foreground">
              {r.ageMonths} months, {r.ageBucket} bucket
            </span>
          </TableCell>
          <TableCell className={cn("text-right font-medium tabular-nums", active)}>{formatCurrency(r.adjustedIncurred)}</TableCell>
          <TableCell className={cn("text-right tabular-nums", active)}>{r.adjustedLossRatio === null ? <Missing what="Adjusted loss ratio (no earned premium)" /> : formatRatioPercent(r.adjustedLossRatio)}</TableCell>
        </>
      ) : null}
    </TableRow>
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
