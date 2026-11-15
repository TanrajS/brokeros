import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConsiderationsPanel } from "@/components/strategy/ConsiderationsPanel";
import { CostChart } from "@/components/strategy/CostChart";
import { EstimatedOptionsTable } from "@/components/strategy/EstimatedOptionsTable";
import { FindingsList } from "@/components/strategy/FindingsList";
import { OptimizerTable } from "@/components/strategy/OptimizerTable";
import { OptionsSection, type OptionRow } from "@/components/strategy/OptionsSection";
import { ReplayTable } from "@/components/strategy/ReplayTable";
import { StrategySettingsForm } from "@/components/strategy/StrategySettingsForm";
import { TcorSection } from "@/components/strategy/TcorSection";
import { ToleranceForm } from "@/components/strategy/ToleranceForm";
import { parseStrategyQuery, strategyHref } from "@/components/strategy/params";
import { ShowMath } from "@/components/dashboard/ShowMath";
import { formatCurrency, formatDate } from "@/lib/format";
import { buildStrategyView } from "@/server/strategy/view";
import { requireWorkspace } from "../../../../lib";

export const metadata: Metadata = { title: "Strategy" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function StrategyPage({ params, searchParams }: { params: Promise<{ slug: string; accountId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ slug, accountId }, sp] = await Promise.all([params, searchParams]);
  const ws = await requireWorkspace(slug);
  const q = parseStrategyQuery(sp);
  const view = await buildStrategyView(ws, accountId, q);
  if (!view) notFound();
  const { choices, policy } = view;

  if (!policy) {
    return (
      <p className="rounded-lg border p-6 text-sm text-muted-foreground">
        No policy on this account is in renewal (open, with no outcome recorded), and none has retention options. Strategy starts once a renewal is underway.
      </p>
    );
  }
  const { line, settings, analysis, grouped, policyOptions, data, otherLines, tcorByOption, tcorValues, considerations, assumptions, missing, findings, tolerances, toleranceDefaults, optionRows, premiumSource, accepted, currentPremium, currentDeductible } = view;
  const query = { ...q, policy: policy.id };
  const a = analysis.value;
  const years = a.years;
  const policyLabel = (p: (typeof choices)[number]) => `${p.lineOfBusiness} · ${p.carrier} · expires ${formatDate(p.expiryDate)}`;
  const optionRowsManual: OptionRow[] = policyOptions.map((o) => ({ id: o.id, label: o.label, carrier: o.carrier, deductible: o.deductible, aggregateCap: o.aggregateCap, premium: o.premium }));
  const yearsText = years.length ? `${years[0].label}–${years[years.length - 1].label}` : "no policy years";
  const runningYear = grouped.value.years.find((y) => y.current)?.label ?? null;
  const basisSentence =
    `Replaying ${years.length} policy year${years.length === 1 ? "" : "s"} (${yearsText}` +
    (runningYear ? `, running year ${settings.values.includeCurrent ? "included as incomplete" : "excluded"}` : "") +
    `) on ${a.basisLabel}` +
    (a.adjusted && a.prospectiveYear ? `, prospective year ${a.prospectiveYear}` : "") +
    `, as of ${formatDate(ws.asOfDate)}.`;

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Policy under analysis" className="flex flex-wrap gap-1.5">
        {choices.map((p) => (
          <Link
            key={p.id}
            href={strategyHref(slug, accountId, { ...query, policy: p.id })}
            aria-current={p.id === policy.id ? "page" : undefined}
            className={cn("inline-flex rounded-full border px-3 py-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", p.id === policy.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {policyLabel(p)}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={a.adjusted ? "default" : "outline"}>Basis in use</Badge>
              <span>{basisSentence}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Expiring {line} with {policy.carrier}: {formatCurrency(policy.annualPremium)} premium, {currentDeductible === null ? "no deductible" : `${formatCurrency(currentDeductible)} deductible`}; premium at the current deductible used for estimates:{" "}
              {formatCurrency(currentPremium)}.
              {tolerances ? ` Tolerances: ${formatCurrency(tolerances.perOccurrence)} per occurrence, ${formatCurrency(tolerances.perYear)} per year${toleranceDefaults.occurrence && toleranceDefaults.year ? " (defaults from revenue)" : ""}; permissible loss ratio ${tolerances.permissibleLossRatio.toFixed(2)}.` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={strategyHref(slug, accountId, query, {}, "/report")}>
                <FileText aria-hidden="true" />
                Generate report
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={strategyHref(slug, accountId, query, {}, "/report/export")} download>
                <Download aria-hidden="true" />
                Export inputs (JSON)
              </a>
            </Button>
          </div>
        </div>
        {settings.invalid ? (
          <p role="alert" className="text-sm text-destructive">
            The settings in the link were not valid, so the defaults are shown.
          </p>
        ) : null}
        {missing.length ? (
          <ul className="list-disc pl-5 text-xs text-amber-900">
            {missing.map((m) => (
              <li key={m}>{m}.</li>
            ))}
          </ul>
        ) : null}
      </div>

      <ToleranceForm
        slug={slug}
        accountId={accountId}
        current={{ toleranceOccurrence: data.account.toleranceOccurrence, toleranceYear: data.account.toleranceYear, permissibleLossRatio: data.account.permissibleLossRatio }}
        defaults={toleranceDefaults.defaults}
        revenue={data.account.annualRevenue}
      />

      <section aria-labelledby="findings-heading" className="flex flex-col gap-3">
        <h2 id="findings-heading" className="text-lg font-semibold">
          Findings and candidates for discussion
        </h2>
        <p className="text-xs text-muted-foreground">
          Read from the program layers, their participations, the loss history, the deductible schedule and the tolerances above. Every statement is supported by the math beside it; nothing here is a decision,
          and &ldquo;recommended&rdquo; appears only as &ldquo;recommended for discussion&rdquo;.
        </p>
        {findings ? (
          <>
            <FindingsList slug={slug} accountId={accountId} findings={findings.value.findings} modifiers={findings.value.modifiers} accepted={[...accepted]} />
            <details className="rounded-lg border">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Band analysis: in-band losses by layer and year</summary>
              <div className="relative overflow-x-auto border-t">
                <table className="w-full min-w-[40rem] text-sm">
                  <caption className="sr-only">Band analysis</caption>
                  <thead className="border-b bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Band</th>
                      <th className="px-3 py-2 text-left font-medium">Responds from ($) / limit ($)</th>
                      {years.map((y) => (
                        <th key={y.label} className="px-3 py-2 text-right font-medium">
                          {y.label} ($)
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right font-medium">Average ($ per year)</th>
                      <th className="px-3 py-2 text-right font-medium">Premium ($)</th>
                      <th className="px-3 py-2 text-left font-medium">Class</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {findings.value.bands.map((b) => (
                      <tr key={b.id}>
                        <td className="px-3 py-2 font-medium">
                          {b.towerLabel} {b.label}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatCurrency(b.attachment)} / {formatCurrency(b.limit)}
                        </td>
                        {b.perYear.map((y) => (
                          <td key={y.label} className="px-3 py-2 text-right tabular-nums">
                            {formatCurrency(y.inBand)}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(b.averageInBand)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{b.premium === null ? "—" : formatCurrency(b.premium)}</td>
                        <td className="px-3 py-2">
                          <Badge variant={b.classification === "working" ? "default" : "outline"}>{b.classification === "working" ? "Working" : "Catastrophe"}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                In-band losses = Σ min(max(incurred − attachment, 0), limit). A band is working when the history shows any loss in it or losses reach it more than 0.2 times a year; otherwise it is a catastrophe band
                and no retention is proposed.
              </p>
            </details>
            <ShowMath lines={findings.math.steps.lines as string[]} />
          </>
        ) : (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">Findings need a deductible on the policy and risk tolerances (from revenue or entered above).</p>
        )}
      </section>

      <OptionsSection slug={slug} policyId={policy.id} expiringCarrier={policy.carrier} rows={optionRowsManual} />

      <section aria-labelledby="options-table-heading" className="flex flex-col gap-3">
        <h2 id="options-table-heading" className="text-lg font-semibold">
          Retention options: estimated and manual premiums
        </h2>
        <EstimatedOptionsTable
          rows={optionRows}
          premiumSource={premiumSource}
          manualHref={strategyHref(slug, accountId, query, { premiums: "" })}
          estimatedHref={strategyHref(slug, accountId, query, { premiums: "estimated" })}
          tolerancePerYear={tolerances?.perYear ?? null}
        />
      </section>

      <section aria-labelledby="optimizer-heading" className="flex flex-col gap-3">
        <h2 id="optimizer-heading" className="text-lg font-semibold">
          Retention optimizer
        </h2>
        <OptimizerTable analysis={a} mathLines={analysis.math.steps.lines as string[]} />
        {a.options.length > 0 && years.length > 0 ? (
          <div className="rounded-lg border p-3">
            <h3 className="mb-1 text-sm font-medium">Expected total cost by option, with the worst historical year</h3>
            <p className="mb-2 text-xs text-muted-foreground">Expected = premium + average retained per year. Worst year = premium + the most retained in any year used. The table above carries the same figures.</p>
            <CostChart points={a.options.map((o) => ({ label: o.option.label, expected: o.expectedTotalCost, worst: o.worstYearTotalCost, worstYear: o.worstYear?.label ?? null }))} />
          </div>
        ) : null}
        <ReplayTable analysis={a} />
        {a.options.length > 0 ? <ShowMath lines={grouped.math.steps.lines as string[]} label="Show how claims were grouped by policy year" /> : null}
      </section>

      <StrategySettingsForm
        key={JSON.stringify(settings.input)}
        slug={slug}
        accountId={accountId}
        policyId={policy.id}
        current={settings.input}
        prospectiveYear={grouped.value.prospectiveYear}
        runningYear={runningYear}
        availableYears={grouped.value.years.length}
      />

      <section aria-labelledby="considerations-heading" className="flex flex-col gap-3">
        <h2 id="considerations-heading" className="text-lg font-semibold">
          Considerations
        </h2>
        <ConsiderationsPanel items={considerations.value} />
      </section>

      <section aria-labelledby="tcor-heading" className="flex flex-col gap-3">
        <h2 id="tcor-heading" className="text-lg font-semibold">
          Total cost of risk by option
        </h2>
        <TcorSection
          slug={slug}
          accountId={accountId}
          line={line}
          fees={{ brokerFees: data.account.brokerFees, riskControlSpend: data.account.riskControlSpend, claimsAdminCost: data.account.claimsAdminCost }}
          revenue={data.account.annualRevenue}
          otherLines={otherLines}
          tcor={tcorValues}
          optionInputs={a.options.map((o) => ({ premium: o.option.premium, averageRetained: o.averageRetained }))}
          mathLines={tcorByOption.map((t) => t.math.steps.lines as string[])}
        />
      </section>

      <section aria-labelledby="assumptions-heading" className="flex flex-col gap-2">
        <h2 id="assumptions-heading" className="text-lg font-semibold">
          Assumptions and limitations
        </h2>
        <p className="text-xs text-muted-foreground">Generated from the settings in use; the report carries the same list.</p>
        <ul className="list-disc rounded-lg border p-4 pl-8 text-sm">
          {assumptions.value.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
