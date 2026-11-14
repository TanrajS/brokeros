import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Missing } from "@/components/Missing";
import { DECLINE_REASON_LABELS, type DeclineReason } from "@/lib/constants";
import type { CarrierLog } from "@/lib/domain/marketing";
import { formatRatioPercent } from "@/lib/format";

function declinesText(d: Partial<Record<DeclineReason, number>>): string {
  const parts = (Object.entries(d) as [DeclineReason, number][]).map(([r, n]) => `${DECLINE_REASON_LABELS[r]} ${n}`);
  return parts.length ? parts.join(", ") : "";
}

/** Per-carrier market log. `compact` drops the declines-by-reason column for the Dashboard card. */
export function MarketLogTable({ carriers, total, compact = false }: { carriers: CarrierLog[]; total: CarrierLog; compact?: boolean }) {
  if (carriers.length === 0) return <p className="rounded-lg border p-4 text-sm text-muted-foreground">No submissions sent in this window.</p>;
  const ratio = (r: number | null, what: string) => (r === null ? <Missing what={what} /> : formatRatioPercent(r));
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Carrier</TableHead>
            <TableHead className="text-right">Sent</TableHead>
            <TableHead className="text-right">Quoted</TableHead>
            <TableHead className="text-right">Bound</TableHead>
            <TableHead className="text-right">Declined</TableHead>
            {!compact ? <TableHead>Declines by reason</TableHead> : null}
            <TableHead className="text-right">Hit ratio</TableHead>
            <TableHead className="text-right">Bind ratio</TableHead>
            <TableHead className="text-right">Median days to respond</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {carriers.map((c) => (
            <TableRow key={c.carrier}>
              <TableCell className="min-w-44 whitespace-normal font-medium">
                {c.carrier}
                {c.flagged ? (
                  <Badge variant="outline" className="ml-1.5 gap-1 border-amber-500/60 align-middle font-normal">
                    <AlertTriangle className="size-3" aria-hidden="true" />
                    {c.submissions} sent, no quotes
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="text-right tabular-nums">{c.submissions}</TableCell>
              <TableCell className="text-right tabular-nums">{c.quotes}</TableCell>
              <TableCell className="text-right tabular-nums">{c.binds}</TableCell>
              <TableCell className="text-right tabular-nums">{c.declineCount}</TableCell>
              {!compact ? <TableCell className="min-w-40 whitespace-normal text-xs text-muted-foreground">{declinesText(c.declines)}</TableCell> : null}
              <TableCell className="text-right tabular-nums">{ratio(c.hitRatio, "Hit ratio (no submissions)")}</TableCell>
              <TableCell className="text-right tabular-nums">{ratio(c.bindRatio, "Bind ratio (no quotes)")}</TableCell>
              <TableCell className="text-right tabular-nums">{c.medianDaysToRespond === null ? <Missing what="Days to respond (no responses)" /> : c.medianDaysToRespond}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableHead scope="row" className="font-semibold">
              All carriers
            </TableHead>
            <TableCell className="text-right tabular-nums">{total.submissions}</TableCell>
            <TableCell className="text-right tabular-nums">{total.quotes}</TableCell>
            <TableCell className="text-right tabular-nums">{total.binds}</TableCell>
            <TableCell className="text-right tabular-nums">{total.declineCount}</TableCell>
            {!compact ? <TableCell className="text-xs text-muted-foreground">{declinesText(total.declines)}</TableCell> : null}
            <TableCell className="text-right tabular-nums">{ratio(total.hitRatio, "Hit ratio")}</TableCell>
            <TableCell className="text-right tabular-nums">{ratio(total.bindRatio, "Bind ratio")}</TableCell>
            <TableCell className="text-right tabular-nums">{total.medianDaysToRespond ?? "—"}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
