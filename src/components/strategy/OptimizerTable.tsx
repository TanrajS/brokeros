import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Missing } from "@/components/Missing";
import { ShowMath } from "@/components/dashboard/ShowMath";
import type { OptionAnalysis, RetentionAnalysis } from "@/lib/domain/strategy";
import { formatCurrency } from "@/lib/format";

const money = (n: number | null | undefined) => formatCurrency(n) ?? "—";
const signed = (n: number) => (n > 0 ? `+${formatCurrency(n)}` : n < 0 ? `−${formatCurrency(-n)}` : formatCurrency(0));

interface Props {
  analysis: RetentionAnalysis;
  mathLines: string[];
  /** Print layout: tighter cells, no collapsible math. */
  print?: boolean;
}

/**
 * One column per option, the base (lowest deductible) first. Every row names its
 * unit; nothing is marked recommended.
 */
export function OptimizerTable({ analysis, mathLines, print = false }: Props) {
  const opts = analysis.options;
  const n = analysis.years.length;
  const head = cn("px-3 py-2 text-left font-medium align-top", print && "px-2 py-1");
  const cell = cn("px-3 py-2 align-top tabular-nums", print && "px-2 py-1");
  const yearsLabel = n ? `${n} year${n === 1 ? "" : "s"}` : "no years";
  if (opts.length === 0) {
    return <p className="rounded-lg border p-4 text-sm text-muted-foreground">Add at least one retention option to run the comparison.</p>;
  }
  const row = (label: React.ReactNode, render: (o: OptionAnalysis) => React.ReactNode, key: string, highlight = false) => (
    <tr key={key} className={highlight ? "bg-muted/20" : undefined}>
      <th scope="row" className={head}>
        {label}
      </th>
      {opts.map((o) => (
        <td key={o.option.id} className={cn(cell, highlight && "font-semibold")}>
          {render(o)}
        </td>
      ))}
    </tr>
  );
  const unit = (text: string) => <span className="block text-xs font-normal text-muted-foreground">{text}</span>;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-x-auto rounded-lg border">
        <table className={cn("w-full min-w-[40rem]", print ? "text-xs" : "text-sm")}>
          <caption className="sr-only">Retention options compared against the lowest-deductible base over {yearsLabel}</caption>
          <thead className="border-b bg-muted/40">
            <tr>
              <th scope="col" className={cn(head, "w-48")}>
                <span className="sr-only">Measure</span>
              </th>
              {opts.map((o) => (
                <th key={o.option.id} scope="col" className={head}>
                  {o.option.label}
                  <span className="block text-xs font-normal text-muted-foreground">{o.option.carrier}</span>
                  {o.isBase ? (
                    <Badge variant="outline" className="mt-1">
                      Base: lowest deductible
                    </Badge>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {row(<>Deductible{unit("$ per claim")}</>, (o) => money(o.option.deductible), "ded")}
            {row(<>Aggregate cap{unit("$ per year")}</>, (o) => (o.option.aggregateCap === null ? <span className="text-muted-foreground">No cap</span> : money(o.option.aggregateCap)), "cap")}
            {row(<>Premium{unit("$ per year")}</>, (o) => money(o.option.premium), "prem")}
            {row(
              <>Average retained losses{unit(`$ per year, over ${yearsLabel}`)}</>,
              (o) => (n ? money(o.averageRetained) : <Missing what="Average retained (no years in use)" />),
              "avg",
            )}
            {row(
              <>Worst-year retained{unit("$ in that year")}</>,
              (o) =>
                o.worstYear ? (
                  <>
                    {money(o.worstYear.retained)} <span className="text-xs text-muted-foreground">({o.worstYear.label})</span>
                  </>
                ) : (
                  <Missing what="Worst year (no years in use)" />
                ),
              "worst",
            )}
            {row(<>Expected total cost{unit("$ per year = premium + average retained")}</>, (o) => money(o.expectedTotalCost), "etc", true)}
            {row(<>Worst-year total cost{unit("$ = premium + worst-year retained")}</>, (o) => money(o.worstYearTotalCost), "wtc")}
            {row(<>Premium saving vs base{unit("$ per year")}</>, (o) => (o.isBase ? <span className="text-muted-foreground">—</span> : money(o.premiumSaving)), "saving")}
            {row(<>Additional expected retained vs base{unit("$ per year")}</>, (o) => (o.isBase ? <span className="text-muted-foreground">—</span> : money(o.additionalRetained)), "addl")}
            {row(
              <>Net expected saving vs base{unit("$ per year = saving − additional retained")}</>,
              (o) => (o.isBase ? <span className="text-muted-foreground">—</span> : <span className={o.netSaving < 0 ? "text-red-800" : undefined}>{signed(o.netSaving)}</span>),
              "net",
              true,
            )}
            {row(
              <>Break-even retained losses{unit("$ of additional retained in a year before the option costs more than the base")}</>,
              (o) => (o.isBase ? <span className="text-muted-foreground">—</span> : money(o.breakEvenRetained)),
              "be",
            )}
            {row(
              <>Worst historical year test{unit("additional retained in that year vs the premium saving")}</>,
              (o) =>
                o.isBase ? (
                  <span className="text-muted-foreground">—</span>
                ) : o.worstYearTest ? (
                  <>
                    <span className={o.worstYearTest.costVersusBase > 0 ? "text-red-800" : undefined}>{o.worstYearTest.sentence}</span>
                    <span className="block text-xs text-muted-foreground">
                      {money(o.worstYearTest.optionRetained)} − {money(o.worstYearTest.baseRetained)} = {money(o.worstYearTest.additionalRetained)} vs {money(o.worstYearTest.premiumSaving)} saving
                    </span>
                  </>
                ) : (
                  <Missing what="Worst-year test (no years in use)" />
                ),
              "wyt",
            )}
            {row(
              <>Maximum annual exposure{unit("$ = deductible × most claims in a year, or the cap if lower")}</>,
              (o) => (
                <>
                  {money(o.maxAnnualExposure.value)}
                  <span className="block text-xs text-muted-foreground">
                    {o.maxAnnualExposure.basis === "aggregate cap" ? "aggregate cap" : `${money(o.option.deductible)} × ${o.maxAnnualExposure.claimCount} claims${o.maxAnnualExposure.claimYear ? ` (${o.maxAnnualExposure.claimYear})` : ""}`}
                  </span>
                </>
              ),
              "max",
            )}
          </tbody>
        </table>
      </div>
      {print ? null : (
        <>
          <p className="text-xs text-muted-foreground">
            Retained = Σ min(incurred, deductible) per year, then min(·, aggregate cap). Transferred = incurred − retained. Averages are over the years in use; the running year, when
            included, counts as a full year. Nothing here is marked as the option to choose: the trade-offs are in the considerations below.
          </p>
          <ShowMath lines={mathLines} />
        </>
      )}
    </div>
  );
}
