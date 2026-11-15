import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Missing } from "@/components/Missing";
import { DaysBadge } from "@/components/book/BookTable";
import { DeletePolicyButton } from "./DeletePolicyButton";
import { daysBetween } from "@/lib/domain/dates";
import { commissionAmount, formatLimit } from "@/lib/domain/money";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { RENEWAL_STATUS_LABELS } from "@/lib/constants";
import { getRenewalStage } from "@/lib/domain/renewals";
import { StageBadge } from "@/components/renewals/StageBadge";
import type { Policy } from "@/server/db/schema";

interface Props {
  slug: string;
  accountId: string;
  asOf: string;
  policies: Policy[];
  /** Co-insurer count per policy id, shown as "+N insurers" beside the carrier. */
  coinsurerCounts?: Record<string, number>;
  /** v1.3: schedule row count per policy id, shown as an "N deductibles" chip. */
  deductibleCounts?: Record<string, number>;
}

export function PoliciesTable({ slug, accountId, asOf, policies, coinsurerCounts = {}, deductibleCounts = {} }: Props) {
  const addHref = `/w/${slug}/accounts/${accountId}/policies/new`;

  return (
    <section aria-labelledby="policies-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="policies-heading" className="text-lg font-semibold">
          Policies
        </h2>
        <Button asChild size="sm">
          <Link href={addHref}>
            <Plus aria-hidden="true" />
            Add policy
          </Link>
        </Button>
      </div>

      {policies.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="text-sm text-muted-foreground">No policies on this account yet. Add the first one to start tracking its renewal.</p>
          <Button asChild variant="outline">
            <Link href={addHref}>
              <Plus aria-hidden="true" />
              Add policy
            </Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Carrier</TableHead>
                <TableHead>Line</TableHead>
                <TableHead>Limits</TableHead>
                <TableHead className="text-right">Deductible</TableHead>
                <TableHead className="text-right">Premium</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Days to expiry</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.map((p) => {
                const limit = formatLimit(p.occurrenceLimit, p.aggregateLimit);
                const missingLimits = limit.math.steps.missing as string[];
                const days = daysBetween(asOf, p.expiryDate).value;
                const commission = commissionAmount(p.annualPremium, p.commissionRate);
                const label = `${p.lineOfBusiness} with ${p.carrier}`;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/w/${slug}/accounts/${accountId}/policies/${p.id}`}
                        className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {p.carrier}
                      </Link>
                      {coinsurerCounts[p.id] ? <span className="ml-1 text-xs text-muted-foreground">+{coinsurerCounts[p.id]} insurers</span> : null}
                      {p.policyNumber ? <span className="block text-xs text-muted-foreground">{p.policyNumber}</span> : null}
                    </TableCell>
                    <TableCell>{p.lineOfBusiness}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {missingLimits.length === 2 ? (
                        <Missing what="Occurrence and aggregate limits" />
                      ) : missingLimits.length === 1 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span tabIndex={0} className="cursor-help">{limit.value}</span>
                          </TooltipTrigger>
                          <TooltipContent>{missingLimits[0]} not entered</TooltipContent>
                        </Tooltip>
                      ) : (
                        limit.value
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.deductible === null ? <Missing what="Deductible" /> : formatCurrency(p.deductible)}
                      {(deductibleCounts[p.id] ?? 0) > 1 ? (
                        <Badge variant="outline" className="ml-1 font-normal">
                          {deductibleCounts[p.id]} deductibles
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(p.annualPremium)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={0} className="cursor-help">
                            {formatCurrency(commission.value)}
                            <span className="ml-1 text-xs text-muted-foreground">{formatPercent(p.commissionRate)}</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {formatCurrency(p.annualPremium)} × {formatPercent(p.commissionRate)} = {formatCurrency(commission.value, { cents: true })}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(p.expiryDate)}</TableCell>
                    <TableCell>
                      <DaysBadge days={days} />
                    </TableCell>
                    <TableCell>
                      <StageBadge stage={getRenewalStage(days, p.renewalStatus).value} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{RENEWAL_STATUS_LABELS[p.renewalStatus]}</Badge>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button asChild size="icon-sm" variant="ghost">
                        <Link href={`/w/${slug}/accounts/${accountId}/policies/${p.id}/edit`} aria-label={`Edit ${label}`}>
                          <Pencil aria-hidden="true" />
                        </Link>
                      </Button>
                      <DeletePolicyButton slug={slug} policyId={p.id} label={label} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
