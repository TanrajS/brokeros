import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DaysBadge } from "@/components/book/BookTable";
import { formatCurrency, formatDate } from "@/lib/format";
import type { RenewalRow } from "@/server/renewals/queries";
import { renewalsHref, type RenewalsQuery } from "./params";
import { ReadinessMeter } from "./ReadinessMeter";
import { OverdueTasks } from "./RenewalCardBits";
import { StageBadge } from "./StageBadge";

export function RenewalList({ slug, query, rows }: { slug: string; query: RenewalsQuery; rows: RenewalRow[] }) {
  const Icon = query.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead>Line · carrier</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead className="text-right">Expiring premium</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead aria-sort={query.dir === "asc" ? "ascending" : "descending"}>
              <Link
                href={renewalsHref(slug, query, { dir: query.dir === "asc" ? "desc" : "asc" })}
                className="inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Days to expiry
                <Icon className="size-3.5 opacity-60" aria-hidden="true" />
                <span className="sr-only">, sorted {query.dir === "asc" ? "soonest first" : "latest first"}; activate to reverse</span>
              </Link>
            </TableHead>
            <TableHead>Readiness</TableHead>
            <TableHead>Tasks</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.policyId}>
              <TableCell className="font-medium">
                <Link href={`/w/${slug}/accounts/${r.accountId}/policies/${r.policyId}`} className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                  {r.accountName}
                </Link>
              </TableCell>
              <TableCell>
                {r.lineOfBusiness}
                <span className="block text-xs text-muted-foreground">{r.carrier}</span>
              </TableCell>
              <TableCell>
                <StageBadge stage={r.stage} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatCurrency(r.premium)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(r.expiryDate)}</TableCell>
              <TableCell>
                <DaysBadge days={r.daysToExpiry} />
              </TableCell>
              <TableCell>
                <ReadinessMeter readiness={r.readiness} notOpened={r.readinessFromTemplate} />
              </TableCell>
              <TableCell>
                <OverdueTasks count={r.overdueTasks} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
