import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import type { RetentionAnalysis } from "@/lib/domain/strategy";
import { formatCurrency, formatDate } from "@/lib/format";

const money = (n: number | null | undefined) => formatCurrency(n) ?? "—";

interface Props {
  analysis: RetentionAnalysis;
  /** Open by default (the report); otherwise collapsed behind a summary. */
  open?: boolean;
  print?: boolean;
}

/** Retained losses by year at each deductible: claims, incurred on the basis in use, and each option's retained and transferred. */
export function RetainedByYearTable({ analysis, open = false, print = false }: Props) {
  const opts = analysis.options;
  const head = cn("px-3 py-2 text-left font-medium align-bottom", print && "px-2 py-1");
  const cell = cn("px-3 py-2 align-top tabular-nums", print && "px-2 py-1");
  if (opts.length === 0 || analysis.years.length === 0) return null;
  const table = (
    <div className="relative overflow-x-auto rounded-lg border">
      <table className={cn("w-full min-w-[36rem]", print ? "text-xs" : "text-sm")}>
        <caption className="sr-only">Retained losses by year at each deductible, {analysis.basisLabel}</caption>
        <thead className="border-b bg-muted/40">
          <tr>
            <th scope="col" className={head}>
              Policy year
            </th>
            <th scope="col" className={cn(head, "text-right")}>
              Claims
            </th>
            <th scope="col" className={cn(head, "text-right")}>
              Incurred
              <span className="block text-xs font-normal text-muted-foreground">$, {analysis.basisLabel}</span>
            </th>
            {opts.map((o) => (
              <th key={o.option.id} scope="col" className={cn(head, "text-right")}>
                {o.option.label}
                <span className="block text-xs font-normal text-muted-foreground">retained / transferred ($)</span>
              </th>
            ))}
            {analysis.anyAboveLimit ? (
              <th scope="col" className={cn(head, "text-right")}>
                Retained above limit
                <span className="block text-xs font-normal text-muted-foreground">$, same for every option</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y">
          {analysis.years.map((y, i) => (
            <tr key={y.label}>
              <th scope="row" className={cn(head, "font-medium whitespace-nowrap")}>
                {y.label}
                {y.current ? (
                  <Badge variant="outline" className="ml-2">
                    incomplete
                  </Badge>
                ) : null}
                <span className="block text-xs font-normal text-muted-foreground">
                  {formatDate(y.period.effectiveDate)} to {formatDate(y.period.expiryDate)}
                </span>
              </th>
              <td className={cn(cell, "text-right")}>{y.claims.length}</td>
              <td className={cn(cell, "text-right")}>{money(y.incurred)}</td>
              {opts.map((o) => {
                const r = o.years[i];
                return (
                  <td key={o.option.id} className={cn(cell, "text-right")}>
                    <span className="font-medium">{money(r.retained)}</span>
                    {r.capApplied ? <span className="block text-xs text-muted-foreground">capped from {money(r.retainedBeforeCap)}</span> : null}
                    <span className="block text-xs text-muted-foreground">{money(r.transferred)} transferred</span>
                  </td>
                );
              })}
              {analysis.anyAboveLimit ? <td className={cn(cell, "text-right font-medium")}>{money(opts[0].years[i].retainedAboveLimit)}</td> : null}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t bg-muted/20 font-medium">
          <tr>
            <th scope="row" className={head}>
              Average per year
            </th>
            <td className={cn(cell, "text-right")}>{(analysis.years.reduce((s, y) => s + y.claims.length, 0) / analysis.years.length).toFixed(1)}</td>
            <td className={cn(cell, "text-right")}>{money(Math.round((analysis.years.reduce((s, y) => s + y.incurred, 0) / analysis.years.length) * 100) / 100)}</td>
            {opts.map((o) => (
              <td key={o.option.id} className={cn(cell, "text-right")}>
                {money(o.averageRetained)}
                <span className="block text-xs font-normal text-muted-foreground">{money(o.averageTransferred)} transferred</span>
              </td>
            ))}
            {analysis.anyAboveLimit ? <td className={cn(cell, "text-right")}>{money(opts[0].averageRetainedAboveLimit)}</td> : null}
          </tr>
        </tfoot>
      </table>
    </div>
  );
  if (print) return table;
  return (
    <details open={open} className="group rounded-lg border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">Retained losses by year at each deductible</summary>
      <div className="flex flex-col gap-2 border-t p-3">
        <p className="text-xs text-muted-foreground">
          Each option applies its deductible to the account&apos;s actual claims, year by year.
          {analysis.anyAboveLimit ? " The part of a loss above its coverage part's occurrence limit is retained by the client whatever the deductible; it is shown in its own column and added to the expected total cost." : ""}
        </p>
        {table}
      </div>
    </details>
  );
}
