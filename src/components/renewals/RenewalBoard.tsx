import Link from "next/link";
import { DaysBadge } from "@/components/book/BookTable";
import { RENEWAL_STAGES } from "@/lib/domain/renewals";
import { formatCurrency } from "@/lib/format";
import type { RenewalRow } from "@/server/renewals/queries";
import { ReadinessMeter } from "./ReadinessMeter";
import { OverdueTasks } from "./RenewalCardBits";

export function RenewalBoard({ slug, rows }: { slug: string; rows: RenewalRow[] }) {
  return (
    <div className="relative -mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0" role="region" aria-label="Renewal board, scrolls sideways" tabIndex={0}>
      <div className="grid auto-cols-[16rem] grid-flow-col gap-3">
        {RENEWAL_STAGES.map((stage) => {
          const cards = rows.filter((r) => r.stage === stage);
          const headingId = `col-${stage.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
          return (
            <section key={stage} aria-labelledby={headingId} className="flex flex-col gap-2 rounded-lg bg-muted/50 p-2">
              <h2 id={headingId} className="flex items-center justify-between px-1 text-sm font-semibold">
                <span>{stage}</span>
                <span className="text-xs font-normal text-muted-foreground tabular-nums">{cards.length}</span>
              </h2>
              {cards.length === 0 ? (
                <p className="px-1 py-3 text-xs text-muted-foreground">No policies</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {cards.map((r) => (
                    <li key={r.policyId}>
                      <Link
                        href={`/w/${slug}/accounts/${r.accountId}/policies/${r.policyId}`}
                        className="flex flex-col gap-2 rounded-lg border bg-background p-3 text-sm outline-none transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="font-medium leading-tight">{r.accountName}</span>
                        <span className="text-xs text-muted-foreground">
                          {r.lineOfBusiness} · {r.carrier}
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className="tabular-nums" aria-label={`Expiring premium ${formatCurrency(r.premium)}`}>
                            {formatCurrency(r.premium)}
                          </span>
                          <DaysBadge days={r.daysToExpiry} />
                        </span>
                        <ReadinessMeter readiness={r.readiness} notOpened={r.readinessFromTemplate} />
                        <OverdueTasks count={r.overdueTasks} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
