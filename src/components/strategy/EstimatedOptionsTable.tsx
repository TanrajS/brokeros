import Link from "next/link";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Missing } from "@/components/Missing";
import { formatCurrency } from "@/lib/format";
import type { OptionRowView } from "@/server/strategy/view";

interface Props {
  rows: OptionRowView[];
  premiumSource: "manual" | "estimated";
  manualHref: string;
  estimatedHref: string;
  tolerancePerYear: number | null;
  print?: boolean;
}

const money = (n: number | null | undefined) => (n === null || n === undefined ? null : formatCurrency(n));
const SOURCE_LABEL: Record<string, string> = { current: "current deductible", tolerance: "per-occurrence tolerance", p50: "50th percentile severity", p75: "75th percentile severity", p90: "90th percentile severity", manual: "entered by hand" };

/** Every deductible in play with its estimated premium beside the one entered by hand, and which one the comparison used. */
export function EstimatedOptionsTable({ rows, premiumSource, manualHref, estimatedHref, tolerancePerYear, print = false }: Props) {
  const head = cn("px-3 py-2 text-left font-medium align-bottom whitespace-nowrap", print && "px-2 py-1");
  const cell = cn("px-3 py-2 align-top tabular-nums", print && "px-2 py-1");
  const pill = (active: boolean) => cn("inline-flex rounded-full border px-3 py-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted");
  return (
    <div className="flex flex-col gap-2">
      {print ? null : (
        <nav aria-label="Premiums used in the comparison" className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted-foreground">Premiums used:</span>
          <Link href={manualHref} aria-current={premiumSource === "manual" ? "page" : undefined} className={pill(premiumSource === "manual")}>
            Manual where entered
          </Link>
          <Link href={estimatedHref} aria-current={premiumSource === "estimated" ? "page" : undefined} className={pill(premiumSource === "estimated")}>
            Estimated for every option
          </Link>
        </nav>
      )}
      <div className="relative overflow-x-auto rounded-lg border">
        <table className={cn("w-full min-w-[48rem]", print ? "text-xs" : "text-sm")}>
          <caption className="sr-only">Retention options with manual and estimated premiums</caption>
          <thead className="border-b bg-muted/40">
            <tr>
              <th className={head}>Deductible ($)</th>
              <th className={head}>Where it came from</th>
              <th className={cn(head, "text-right")}>Manual premium ($ per year, entered by hand)</th>
              <th className={cn(head, "text-right")}>Estimated premium ($ per year)</th>
              <th className={cn(head, "text-right")}>Estimated credit ($)</th>
              <th className={cn(head, "text-right")}>Average retained ($ per year)</th>
              <th className={cn(head, "text-right")}>Worst year retained ($)</th>
              <th className={head}>Premium used</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={cn(cell, "font-medium")}>
                  {money(r.deductible)}
                  {r.isCurrent ? (
                    <Badge variant="outline" className="ml-1">
                      Current
                    </Badge>
                  ) : null}
                </td>
                <td className={cn(cell, "text-xs")}>{r.estimated ? SOURCE_LABEL[r.estimated.source] : "entered by hand"}{r.manualOptionId && r.estimated && r.estimated.source !== "manual" ? " (also entered by hand)" : ""}</td>
                <td className={cn(cell, "text-right")}>{r.manualPremium === null ? <span className="text-muted-foreground">—</span> : money(r.manualPremium)}</td>
                <td className={cn(cell, "text-right")}>
                  {r.estimated ? (
                    <>
                      {money(r.estimated.estimated.premium)}
                      {r.estimated.estimated.floored ? <span className="block text-xs text-amber-900">floored at 25% of current</span> : null}
                    </>
                  ) : (
                    <Missing what="Estimated premium (tolerances or current deductible missing)" />
                  )}
                </td>
                <td className={cn(cell, "text-right")}>{r.estimated ? money(r.estimated.estimated.credit) : "—"}</td>
                <td className={cn(cell, "text-right")}>{r.estimated ? money(r.estimated.averageRetained) : "—"}</td>
                <td className={cn(cell, "text-right")}>
                  {r.estimated?.worstYear ? (
                    <>
                      {money(r.estimated.worstYear.retained)} <span className="text-xs text-muted-foreground">({r.estimated.worstYear.label})</span>
                      {tolerancePerYear !== null ? <span className={cn("block text-xs", r.estimated.withinAnnualTolerance ? "text-muted-foreground" : "text-red-800")}>{r.estimated.withinAnnualTolerance ? "within" : "above"} the {money(tolerancePerYear)} annual tolerance</span> : null}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={cn(cell, "text-xs")}>
                  {money(r.premiumUsed)} <span className="text-muted-foreground">({r.usedSource})</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Estimated premiums are derived from your loss history and this ratio; they are not quotes.</p>
    </div>
  );
}
