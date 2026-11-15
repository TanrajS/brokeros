import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/marketing/PrintButton";
import { TowerDiagram } from "@/components/program/TowerDiagram";
import { ConsiderationsPanel } from "@/components/strategy/ConsiderationsPanel";
import { OptimizerTable } from "@/components/strategy/OptimizerTable";
import { ReplayTable } from "@/components/strategy/ReplayTable";
import { TcorSection } from "@/components/strategy/TcorSection";
import { parseStrategyQuery, strategyHref } from "@/components/strategy/params";
import { EXPOSURE_BASIS_LABELS, SUBMISSION_STATUS_LABELS } from "@/lib/constants";
import { policyYearSummary } from "@/lib/domain/lossRuns";
import { formatLimit } from "@/lib/domain/money";
import { COVERAGE_STATUS_LABELS, LAYER_BASIS_LABELS, LINE_GROUP_LABELS, REQUIREMENT_STATUS_LABELS, analyzeTower, checkRequirements, coverageProfile, isAdvancedProgram, programTotals, towerInputsFrom, type LineGroup } from "@/lib/domain/program";
import { describeRule } from "@/lib/domain/deductibles";
import { formatCurrency, formatDate, formatInteger, formatRatioPercent, formatSignedPercent, titleCase } from "@/lib/format";
import { buildMarketingView } from "@/server/marketing/view";
import { layersFor, loadProgramInputs, toProgramPolicy, toRequirementInput } from "@/server/program/queries";
import { buildStrategyView } from "@/server/strategy/view";
import { requireWorkspace } from "../../../../../lib";

export const metadata: Metadata = { title: "Renewal strategy report" };

type SearchParams = Record<string, string | string[] | undefined>;
const money = (n: number | null | undefined) => formatCurrency(n) ?? "—";
const groupFor = (line: string): LineGroup | null => (line === "General Liability" ? "gl" : line === "Commercial Auto" ? "auto" : line === "Property" ? "property" : null);

/**
 * The client-facing document: profile and exposures, program, loss history,
 * contract requirements, market results, retention options with the replay,
 * TCOR by option, considerations, and assumptions generated from the settings
 * in use. It compares; it never says what to buy.
 */
export default async function StrategyReportPage({ params, searchParams }: { params: Promise<{ slug: string; accountId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ slug, accountId }, sp] = await Promise.all([params, searchParams]);
  const ws = await requireWorkspace(slug);
  const q = parseStrategyQuery(sp);
  const view = await buildStrategyView(ws, accountId, q);
  if (!view || !view.policy) notFound();
  const { policy, line, data, analysis, replay, schedule, inForce, otherLines, tcorByOption, tcorValues, considerations, assumptions } = view;
  const query = { ...q, policy: policy.id };
  const [program, marketing] = await Promise.all([loadProgramInputs(ws, accountId), buildMarketingView(ws, accountId, { policy: policy.id, target: "", normalise: false, sort: "premium" })]);
  if (!program) notFound();
  const acct = data.account;
  const a = analysis.value;

  // Program summary: the tower for this line's group (GL or Auto), when one exists.
  const group = groupFor(line);
  const groupLayers = group ? layersFor(program, group) : [];
  const towerInputs = towerInputsFrom(groupLayers);
  const tower = groupLayers.length ? analyzeTower(towerInputs) : null;
  // v1.3: a subscription placement shows its coverage profile and participations instead of the single-insurer tower.
  const advanced = isAdvancedProgram(groupLayers);
  const tiv = policy.insurableValue ?? data.policies.find((p) => groupLayers.some((l) => l.policyId === p.id) && p.insurableValue !== null)?.insurableValue ?? null;
  const profile = advanced ? coverageProfile(groupLayers, tiv).value : null;
  const totals = advanced ? programTotals(groupLayers, tiv).value : null;
  const scheduleRules = schedule.filter((r) => !r.isDefault);

  // Contract requirements against current terms, with the line group's tower (umbrella not counted, the checker's default view).
  const superseded = new Set(program.policies.map((p) => p.previousPolicyId).filter((x): x is string => x !== null));
  const currentPolicies = program.policies.filter((p) => !superseded.has(p.id) && p.expiryDate > ws.asOfDate).map((p) => toProgramPolicy(p, program.renewedOn.get(p.id) ?? null));
  const requirements = checkRequirements(program.requirements.map(toRequirementInput), currentPolicies, towerInputs, { countUmbrella: false }).value;

  // Five-year loss history on the same basis as the replay.
  const losses = policyYearSummary({ claims: data.claims, policies: data.lrPolicies, line, asOf: ws.asOfDate, adjustments: replay.adjustments }).value;
  const lossRows = losses.rows.slice(-5);

  const quotes = marketing && marketing.policy ? marketing.comparison.value.quotes : [];
  const submissions = marketing && marketing.policy ? marketing.submissionViews : [];

  const h2 = "text-lg font-semibold print:text-base";
  const h3 = "mb-1 font-semibold print:text-sm";
  const sec = "flex flex-col gap-2 break-inside-avoid";
  const dl = "grid grid-cols-[11rem_1fr] gap-x-4 gap-y-1 text-sm print:text-xs";
  const th = "px-2 py-1 text-left font-medium";
  const td = "px-2 py-1 align-top tabular-nums";
  const yearsText = a.years.length ? `${a.years[0].label}–${a.years[a.years.length - 1].label}` : "no policy years";

  return (
    <article className="mx-auto flex w-full max-w-5xl flex-col gap-8 print:max-w-none print:gap-5 print:text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={strategyHref(slug, accountId, query)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Strategy
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={strategyHref(slug, accountId, query, {}, "/report/export")} download>
              <Download aria-hidden="true" />
              Export inputs (JSON)
            </a>
          </Button>
          <PrintButton />
        </div>
      </div>

      <header className="border-b pb-3">
        <h2 className="text-2xl font-semibold print:text-xl">Renewal strategy report: {acct.name}</h2>
        <p className="text-sm text-muted-foreground print:text-xs">
          {line} renewal, expiring {formatDate(policy.expiryDate)} with {policy.carrier}. Prepared as of {formatDate(ws.asOfDate)}. Figures replayed over {yearsText} on {a.basisLabel}.
          This report compares options; it does not state which the client should buy.
        </p>
      </header>

      {/* 1. Account profile and exposures */}
      <section aria-labelledby="rp-profile" className={sec}>
        <h2 id="rp-profile" className={h2}>
          1. Account profile and exposures
        </h2>
        <dl className={dl}>
          <dt className="text-muted-foreground">Industry</dt>
          <dd>{titleCase(acct.industry)}</dd>
          <dt className="text-muted-foreground">Province</dt>
          <dd>{acct.province}</dd>
          <dt className="text-muted-foreground">Annual revenue</dt>
          <dd>{formatCurrency(acct.annualRevenue) ?? "Not entered"}</dd>
          <dt className="text-muted-foreground">Employees</dt>
          <dd>{formatInteger(acct.employeeCount) ?? "Not entered"}</dd>
          <dt className="text-muted-foreground">Operations</dt>
          <dd>{acct.notes ?? "Not entered"}</dd>
        </dl>
        <div className="relative overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[36rem] text-sm print:text-xs">
            <caption className="sr-only">In-force policies and exposures</caption>
            <thead className="border-b bg-muted/40">
              <tr>
                <th className={th}>Line</th>
                <th className={th}>Carrier</th>
                <th className={th}>Term</th>
                <th className={th}>Exposure</th>
                <th className={`${th} text-right`}>Limits ($ occ / agg)</th>
                <th className={`${th} text-right`}>Deductible ($)</th>
                <th className={`${th} text-right`}>Premium ($ per year)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {inForce.map((p) => (
                <tr key={p.id} className={p.id === policy.id ? "bg-primary/5" : undefined}>
                  <td className={td}>
                    {p.lineOfBusiness}
                    {p.id === policy.id ? <span className="block text-xs text-muted-foreground">under analysis</span> : null}
                  </td>
                  <td className={td}>{p.carrier}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {formatDate(p.effectiveDate)} to {formatDate(p.expiryDate)}
                  </td>
                  <td className={td}>
                    {p.exposureAmount === null ? "Not entered" : p.exposureBasis === "revenue" || p.exposureBasis === "payroll" ? money(p.exposureAmount) : formatInteger(p.exposureAmount)}{" "}
                    <span className="text-muted-foreground">({EXPOSURE_BASIS_LABELS[p.exposureBasis].toLowerCase()})</span>
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    {formatLimit(p.occurrenceLimit, p.aggregateLimit).value}
                  </td>
                  <td className={`${td} text-right`}>{money(p.deductible)}</td>
                  <td className={`${td} text-right`}>{money(p.annualPremium)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {scheduleRules.length > 0 ? (
        <section aria-labelledby="rp-schedule" className={sec}>
          <h3 id="rp-schedule" className={h3}>
            Deductible schedule in force ({line})
          </h3>
          <ul className="list-disc pl-6 text-sm print:text-xs">
            <li>All other perils (default): {policy.deductible === null ? "not entered" : money(policy.deductible)}</li>
            {scheduleRules.map((r) => (
              <li key={r.id ?? r.appliesTo}>{describeRule(r)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* 2. Program summary */}
      <section aria-labelledby="rp-program" className={sec}>
        <h2 id="rp-program" className={h2}>
          2. Program summary
        </h2>
        {advanced && profile && totals && group ? (
          <>
            <p className="text-sm text-muted-foreground print:text-xs">
              {LINE_GROUP_LABELS[group]} placed on a subscription basis across {new Set(groupLayers.map((l) => l.towerLabel)).size} tower{new Set(groupLayers.map((l) => l.towerLabel)).size === 1 ? "" : "s"}: program premium {money(totals.totalPremium)}, placed limit{" "}
              {money(totals.totalPlacedLimit)}
              {totals.ratePer100Tiv !== null ? `, $${totals.ratePer100Tiv.toFixed(4)} per $100 of the ${money(tiv)} TIV` : ""}. Coverage is {profile.fullyPlaced ? "100% at every point" : `not fully placed (${money(profile.totalUnplacedDollars)} unplaced)`}.
              {profile.bases.length > 1 ? ` Layers mix bases (${profile.bases.map((b) => LAYER_BASIS_LABELS[b].toLowerCase()).join(", ")}); the profile adds shares across bases.` : ""}
            </p>
            <div className="relative overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[30rem] text-sm print:text-xs">
                <caption className="sr-only">Coverage profile</caption>
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className={th}>Segment ($)</th>
                    <th className={th}>Layers</th>
                    <th className={`${th} text-right`}>Placed (%)</th>
                    <th className={th}>Status</th>
                    <th className={`${th} text-right`}>Unplaced ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {profile.segments.map((seg) => (
                    <tr key={`${seg.from}-${seg.to}`}>
                      <td className={`${td} whitespace-nowrap`}>
                        {money(seg.from)} to {money(seg.to)}
                      </td>
                      <td className={td}>{seg.contributions.map((c) => `${c.towerLabel} ${c.label} ${(c.share * 100).toFixed(0)}%`).join(" + ") || "none"}</td>
                      <td className={`${td} text-right`}>{(seg.placedShare * 100).toFixed(2)}%</td>
                      <td className={td}>{COVERAGE_STATUS_LABELS[seg.status]}</td>
                      <td className={`${td} text-right`}>{seg.unplacedDollars > 0 ? money(seg.unplacedDollars) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="relative overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[40rem] text-sm print:text-xs">
                <caption className="sr-only">Participations</caption>
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className={th}>Tower</th>
                    <th className={th}>Layer</th>
                    <th className={th}>Insurer</th>
                    <th className={`${th} text-right`}>Written (%)</th>
                    <th className={`${th} text-right`}>Signed (%)</th>
                    <th className={`${th} text-right`}>Premium ($)</th>
                    <th className={`${th} text-right`}>Exposed limit ($)</th>
                    <th className={`${th} text-right`}>Rate on line (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {totals.layers.flatMap((s) => [
                    ...s.participations.map((p) => (
                      <tr key={p.id}>
                        <td className={td}>{s.layer.towerLabel}</td>
                        <td className={td}>{s.label}</td>
                        <td className={td}>
                          {p.insurer}
                          {p.isLead ? " (lead)" : ""}
                        </td>
                        <td className={`${td} text-right`}>{p.writtenLinePct === null ? "—" : `${p.writtenLinePct}%`}</td>
                        <td className={`${td} text-right`}>{p.signedLinePct}%</td>
                        <td className={`${td} text-right`}>{money(p.premium)}</td>
                        <td className={`${td} text-right`}>{money(p.exposedLimit)}</td>
                        <td className={`${td} text-right`}>{p.rateOnLine === null ? "—" : `${(p.rateOnLine * 100).toFixed(4)}%`}</td>
                      </tr>
                    )),
                    <tr key={`${s.layer.id}-total`} className="bg-muted/20 font-medium">
                      <td className={td} colSpan={3}>
                        {s.layer.towerLabel} {s.label}: layer total
                      </td>
                      <td className={td} />
                      <td className={`${td} text-right`}>{(s.placedShare * 100).toFixed(1)}%</td>
                      <td className={`${td} text-right`}>{money(s.layerPremium)}</td>
                      <td className={`${td} text-right`}>{money(s.placedLimit)}</td>
                      <td className={`${td} text-right`}>{s.rateOnLine === null ? "—" : `${(s.rateOnLine * 100).toFixed(4)}%`}</td>
                    </tr>,
                  ])}
                </tbody>
              </table>
            </div>
          </>
        ) : tower && group ? (
          <>
            <p className="text-sm text-muted-foreground print:text-xs">
              {LINE_GROUP_LABELS[group]} tower: {tower.value.layers.length} layer{tower.value.layers.length === 1 ? "" : "s"}
              {tower.value.totalLimit !== null ? `, ${money(tower.value.totalLimit)} total limit` : ", layers do not stack cleanly"}.
              {tower.value.findings.length ? ` Findings: ${tower.value.findings.map((f) => f.message).join(" ")}` : ""}
            </p>
            <TowerDiagram analysis={tower.value} />
            <div className="relative overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[30rem] text-sm print:text-xs">
                <caption className="sr-only">Tower layers</caption>
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className={th}>Layer</th>
                    <th className={th}>Carrier</th>
                    <th className={`${th} text-right`}>Attachment ($)</th>
                    <th className={`${th} text-right`}>Limit ($)</th>
                    <th className={`${th} text-right`}>Premium ($ per year)</th>
                    <th className={`${th} text-right`}>Rate on line (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tower.value.layers.map((l) => (
                    <tr key={l.id}>
                      <td className={td}>{l.label}</td>
                      <td className={td}>{l.carrier}</td>
                      <td className={`${td} text-right`}>{money(l.attachment)}</td>
                      <td className={`${td} text-right`}>{money(l.limit)}</td>
                      <td className={`${td} text-right`}>{money(l.premium)}</td>
                      <td className={`${td} text-right`}>{l.rateOnLine === null ? "—" : formatRatioPercent(l.rateOnLine)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground print:text-xs">No tower is recorded for {line}; the in-force policies above are the program.</p>
        )}
      </section>

      {/* 3. Five-year loss history */}
      <section aria-labelledby="rp-losses" className={sec}>
        <h2 id="rp-losses" className={h2}>
          3. Five-year loss history
        </h2>
        <p className="text-sm text-muted-foreground print:text-xs">
          {line}, {lossRows.length} most recent policy year{lossRows.length === 1 ? "" : "s"}, as of {formatDate(ws.asOfDate)}. Basis:{" "}
          {losses.adjusted
            ? `adjusted (${[replay.adjustments.trendRate !== null ? `trend ${formatRatioPercent(replay.adjustments.trendRate)} a year to ${losses.prospectiveYear}` : null, replay.adjustments.factors ? "development factors by age" : null].filter(Boolean).join(", ")})`
            : "raw incurred (paid + reserved), no trend, no development"}
          . The running year&apos;s premium is earned to date.
        </p>
        <div className="relative overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[36rem] text-sm print:text-xs">
            <caption className="sr-only">Loss history by policy year</caption>
            <thead className="border-b bg-muted/40">
              <tr>
                <th className={th}>Policy year</th>
                <th className={`${th} text-right`}>Claims</th>
                <th className={`${th} text-right`}>Open</th>
                <th className={`${th} text-right`}>Paid ($)</th>
                <th className={`${th} text-right`}>Reserved ($)</th>
                <th className={`${th} text-right`}>Incurred ($)</th>
                {losses.adjusted ? <th className={`${th} text-right`}>Adjusted incurred ($)</th> : null}
                <th className={`${th} text-right`}>Earned premium ($)</th>
                <th className={`${th} text-right`}>Loss ratio (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lossRows.map((r) => (
                <tr key={r.period.policyId}>
                  <td className={`${td} whitespace-nowrap`}>
                    {r.label}
                    {r.current ? <Badge variant="outline" className="ml-2">running</Badge> : null}
                  </td>
                  <td className={`${td} text-right`}>{r.claimCount}</td>
                  <td className={`${td} text-right`}>{r.openCount}</td>
                  <td className={`${td} text-right`}>{money(r.paid)}</td>
                  <td className={`${td} text-right`}>{money(r.reserved)}</td>
                  <td className={`${td} text-right`}>{money(r.incurred)}</td>
                  {losses.adjusted ? <td className={`${td} text-right`}>{money(r.adjustedIncurred)}</td> : null}
                  <td className={`${td} text-right`}>{money(r.earnedPremium)}</td>
                  <td className={`${td} text-right`}>{(losses.adjusted ? r.adjustedLossRatio : r.lossRatio) === null ? "—" : formatRatioPercent(losses.adjusted ? r.adjustedLossRatio : r.lossRatio)}</td>
                </tr>
              ))}
              {losses.total ? (
                <tr className="bg-muted/20 font-medium">
                  <td className={td}>{losses.total.label}</td>
                  <td className={`${td} text-right`}>{losses.total.claimCount}</td>
                  <td className={`${td} text-right`}>{losses.total.openCount}</td>
                  <td className={`${td} text-right`}>{money(losses.total.paid)}</td>
                  <td className={`${td} text-right`}>{money(losses.total.reserved)}</td>
                  <td className={`${td} text-right`}>{money(losses.total.incurred)}</td>
                  {losses.adjusted ? <td className={`${td} text-right`}>{money(losses.total.adjustedIncurred)}</td> : null}
                  <td className={`${td} text-right`}>{money(losses.total.earnedPremium)}</td>
                  <td className={`${td} text-right`}>{(losses.adjusted ? losses.total.adjustedLossRatio : losses.total.lossRatio) === null ? "—" : formatRatioPercent(losses.adjusted ? losses.total.adjustedLossRatio : losses.total.lossRatio)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Contract requirement status */}
      <section aria-labelledby="rp-requirements" className={sec}>
        <h2 id="rp-requirements" className={h2}>
          4. Contract requirement status
        </h2>
        {requirements.length === 0 ? (
          <p className="text-sm text-muted-foreground print:text-xs">No contract requirements are recorded for this account.</p>
        ) : (
          <div className="relative overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[36rem] text-sm print:text-xs">
              <caption className="sr-only">Contract requirements against current policies</caption>
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className={th}>Contract</th>
                  <th className={th}>Coverage</th>
                  <th className={`${th} text-right`}>Required ($ occ / agg)</th>
                  <th className={`${th} text-right`}>Provided ($ occ / agg)</th>
                  <th className={th}>Endorsements missing</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {requirements.map((r) => (
                  <tr key={r.requirement.id}>
                    <td className={td}>
                      {r.requirement.contractName}
                      <span className="block text-xs text-muted-foreground">{r.requirement.counterparty}</span>
                    </td>
                    <td className={td}>{r.requirement.coverage}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      {formatLimit(r.requirement.requiredOccurrence, r.requirement.requiredAggregate).value}
                    </td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      {formatLimit(r.providedOccurrence, r.providedAggregate).value}
                    </td>
                    <td className={td}>{r.endorsementsMissing.length ? r.endorsementsMissing.join(", ") : "None"}</td>
                    <td className={td}>
                      {r.status === "shortfall" && (r.shortfallOccurrence > 0 || r.shortfallAggregate > 0) ? `Shortfall ${money(Math.max(r.shortfallOccurrence, r.shortfallAggregate))}` : REQUIREMENT_STATUS_LABELS[r.status]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 5. Market results */}
      <section aria-labelledby="rp-market" className={sec}>
        <h2 id="rp-market" className={h2}>
          5. Market results
        </h2>
        {submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground print:text-xs">No carriers have been approached for this renewal yet.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground print:text-xs">
              {submissions.length} carrier{submissions.length === 1 ? "" : "s"} approached: {submissions.map((s) => `${s.carrier} (${SUBMISSION_STATUS_LABELS[s.status].toLowerCase()})`).join(", ")}. Expiring:{" "}
              {money(policy.annualPremium)} with {policy.carrier}.
            </p>
            {quotes.length > 0 ? (
              <div className="relative overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[36rem] text-sm print:text-xs">
                  <caption className="sr-only">Quotes compared with the expiring terms</caption>
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th className={th}>Carrier</th>
                      <th className={`${th} text-right`}>Premium ($ per year)</th>
                      <th className={`${th} text-right`}>Change vs expiring (%)</th>
                      <th className={`${th} text-right`}>Limits ($ occ / agg)</th>
                      <th className={`${th} text-right`}>Deductible ($)</th>
                      <th className={th}>Terms vs expiring</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {quotes.map((c) => (
                      <tr key={c.quote.id}>
                        <td className={td}>
                          {c.quote.carrier}
                          {c.quote.isIncumbent ? <span className="block text-xs text-muted-foreground">incumbent</span> : null}
                          {c.expired ? <span className="block text-xs text-red-800">quote expired</span> : null}
                        </td>
                        <td className={`${td} text-right`}>{money(c.quote.premium)}</td>
                        <td className={`${td} text-right`}>{formatSignedPercent(c.premiumChange) ?? "—"}</td>
                        <td className={`${td} text-right whitespace-nowrap`}>
                          {formatLimit(c.quote.occurrenceLimit, c.quote.aggregateLimit).value}
                        </td>
                        <td className={`${td} text-right`}>{money(c.quote.deductible)}</td>
                        <td className={td}>
                          {c.termsMatched} of {c.termsCompared} match
                          {c.mismatches.length ? <span className="block text-xs text-muted-foreground">{c.mismatches.map((m) => m.note).join("; ")}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground print:text-xs">No quotes recorded yet.</p>
            )}
          </>
        )}
      </section>

      {/* 6. Retention options */}
      <section aria-labelledby="rp-options" className={sec}>
        <h2 id="rp-options" className={h2}>
          6. Retention options
        </h2>
        <p className="text-sm text-muted-foreground print:text-xs">
          Each option replayed against {yearsText} ({a.years.length} year{a.years.length === 1 ? "" : "s"}) on {a.basisLabel}; the lowest deductible is the base. Retained = Σ min(incurred, deductible) per
          year, then the aggregate cap where one exists.
        </p>
        <OptimizerTable analysis={a} mathLines={[]} print />
        <h3 className={h3}>Per-year replay</h3>
        <ReplayTable analysis={a} print />
      </section>

      {/* 7. TCOR */}
      <section aria-labelledby="rp-tcor" className={sec}>
        <h2 id="rp-tcor" className={h2}>
          7. Total cost of risk by option
        </h2>
        <p className="text-sm text-muted-foreground print:text-xs">
          TCOR = premiums + expected retained losses + broker fees ({money(acct.brokerFees)}) + risk control spend ({money(acct.riskControlSpend)}) + internal claims administration (
          {money(acct.claimsAdminCost)}). Premiums are the in-force program with the option&apos;s premium for {line}.
        </p>
        <TcorSection
          slug={slug}
          accountId={accountId}
          line={line}
          fees={{ brokerFees: acct.brokerFees, riskControlSpend: acct.riskControlSpend, claimsAdminCost: acct.claimsAdminCost }}
          revenue={acct.annualRevenue}
          otherLines={otherLines}
          tcor={tcorValues}
          optionInputs={a.options.map((o) => ({ premium: o.option.premium, averageRetained: o.averageRetained }))}
          mathLines={tcorByOption.map((t) => t.math.steps.lines as string[])}
          print
        />
      </section>

      {/* 8. Considerations */}
      <section aria-labelledby="rp-considerations" className={sec}>
        <h2 id="rp-considerations" className={h2}>
          8. Considerations
        </h2>
        <ConsiderationsPanel items={considerations.value} print />
      </section>

      {/* 9. Assumptions */}
      <section aria-labelledby="rp-assumptions" className={sec}>
        <h2 id="rp-assumptions" className={h2}>
          9. Assumptions and limitations
        </h2>
        <ul className="list-disc pl-6 text-sm print:text-xs">
          {assumptions.value.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>

      <footer className="border-t pt-2 text-xs text-muted-foreground">
        Prepared with Broker OS as of {formatDate(ws.asOfDate)}. All inputs are exportable as JSON for audit. Carriers and companies in the demo book are fictional.
      </footer>
    </article>
  );
}
