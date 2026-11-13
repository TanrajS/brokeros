import Link from "next/link";
import { cn } from "cn";
import { formatCurrency } from "@/lib/format";
import type { StageSummaryRow } from "@/lib/domain/renewals";
import { renewalsHref, type RenewalsQuery } from "./params";

export function SummaryStrip({ slug, query, summary, overdueTasks }: { slug: string; query: RenewalsQuery; summary: StageSummaryRow[]; overdueTasks: number }) {
  return (
    <section aria-labelledby="summary-heading">
      <h2 id="summary-heading" className="sr-only">
        Summary by stage
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {summary.map((s) => {
          const selected = query.stage === s.stage;
          return (
            <li key={s.stage}>
              <Link
                href={renewalsHref(slug, query, { stage: selected ? "" : s.stage })}
                aria-current={selected ? "true" : undefined}
                aria-label={`${s.stage}: ${s.count} ${s.count === 1 ? "policy" : "policies"}, ${formatCurrency(s.premium)} expiring premium. ${selected ? "Remove stage filter" : "Filter to this stage"}`}
                className={cn(
                  "flex h-full flex-col gap-0.5 rounded-lg border p-2.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected && "border-primary bg-muted",
                  s.stage === "Expired — action required" && s.count > 0 && "border-destructive/40",
                )}
              >
                <span className="text-xs text-muted-foreground">{s.stage}</span>
                <span className="text-lg font-semibold tabular-nums">{s.count}</span>
                <span className="text-xs tabular-nums">{formatCurrency(s.premium)}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <div className={cn("flex h-full flex-col gap-0.5 rounded-lg border p-2.5 text-sm", overdueTasks > 0 && "border-destructive/40 bg-destructive/5")}>
            <span className="text-xs text-muted-foreground">Overdue tasks</span>
            <span className="text-lg font-semibold tabular-nums">{overdueTasks}</span>
            <span className="text-xs text-muted-foreground">on these policies</span>
          </div>
        </li>
      </ul>
    </section>
  );
}
