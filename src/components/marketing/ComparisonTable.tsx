import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Missing } from "@/components/Missing";
import { ShowMath } from "@/components/dashboard/ShowMath";
import { ENDORSEMENTS, ENDORSEMENT_LABELS } from "@/lib/constants";
import type { ExpiringTerms, QuoteComparison, QuoteComparisonResult, TermComparison, TermKey } from "@/lib/domain/marketing";
import { formatCurrency, formatSignedPercent } from "@/lib/format";

export type SortKey = "premium" | "change" | "commission" | "terms";
export const SORT_LABELS: Record<SortKey, string> = { premium: "Premium", change: "Premium change", commission: "Commission", terms: "Terms matched" };

export function sortComparisons(rows: QuoteComparison[], key: SortKey): QuoteComparison[] {
  const by: Record<SortKey, (c: QuoteComparison) => number> = {
    premium: (c) => c.quote.premium,
    change: (c) => c.premiumChange ?? 0,
    commission: (c) => -c.commission,
    terms: (c) => -c.termsMatched,
  };
  return [...rows].sort((a, b) => by[key](a) - by[key](b) || a.quote.premium - b.quote.premium);
}

const TERM_LABEL: Record<"occurrence" | "aggregate" | "deductible", string> = { occurrence: "Occurrence limit", aggregate: "Aggregate limit", deductible: "Deductible" };
const money = (n: number | null): string => (n === null ? "—" : (formatCurrency(n) ?? "—"));

function quoteValue(c: QuoteComparison, term: TermKey): string {
  if (term === "occurrence") return money(c.quote.occurrenceLimit);
  if (term === "aggregate") return money(c.quote.aggregateLimit);
  if (term === "deductible") return money(c.quote.deductible);
  return c.quote.endorsements.includes(term) ? "Included" : "Not included";
}

function expiringValue(e: ExpiringTerms, term: TermKey): string {
  if (term === "occurrence") return money(e.occurrenceLimit);
  if (term === "aggregate") return money(e.aggregateLimit);
  if (term === "deductible") return money(e.deductible);
  return e.endorsements.includes(term) ? "Included" : "Not included";
}

function cellTone(t: TermComparison | undefined): string {
  if (!t || t.matches) return "";
  return t.direction === "better" || t.direction === "added" ? "bg-amber-50" : "bg-red-50";
}

interface Props {
  expiring: ExpiringTerms;
  result: QuoteComparisonResult;
  rows: QuoteComparison[];
  sort: SortKey;
  sortHref: (k: SortKey) => string;
  mathLines: string[];
}

/** Expiring terms in the first column, one column per quote. Mismatches are shaded and spelled out; nothing is rolled into a score. */
export function ComparisonTable({ expiring, result, rows, sort, sortHref, mathLines }: Props) {
  const terms: TermKey[] = [
    ...(["occurrence", "aggregate", "deductible"] as const).filter((t) => rows.some((r) => r.terms.some((x) => x.term === t))),
    ...ENDORSEMENTS.filter((e) => rows.some((r) => r.terms.some((x) => x.term === e))),
  ];
  const head = "px-3 py-2 text-left font-medium align-top";
  const cell = "px-3 py-2 align-top tabular-nums";
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">Quotes compared with the expiring terms and the target ({result.target.label})</caption>
          <thead className="border-b bg-muted/40">
            <tr>
              <th scope="col" className={cn(head, "w-44")}>
                <span className="sr-only">Measure</span>
              </th>
              <th scope="col" className={head}>
                Expiring
                <span className="block text-xs font-normal text-muted-foreground">{expiring.carrier}</span>
              </th>
              {rows.map((c) => (
                <th key={c.quote.id} scope="col" className={head}>
                  {c.quote.carrier}
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {c.quote.isIncumbent ? <Badge variant="outline">Incumbent</Badge> : null}
                    {c.expired ? <Badge variant="destructive">Expired</Badge> : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr className="bg-muted/20">
              <th scope="row" className={head}>
                Summary
                <span className="mt-1 flex flex-wrap gap-1 text-xs font-normal">
                  Sort by:
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                    <Link key={k} href={sortHref(k)} scroll={false} aria-current={sort === k ? "true" : undefined} className={cn("underline-offset-2 hover:underline", sort === k && "font-semibold")}>
                      {SORT_LABELS[k]}
                      {sort === k ? <ArrowDown className="inline size-3" aria-hidden="true" /> : null}
                    </Link>
                  ))}
                </span>
              </th>
              <td className={cell}>
                <span className="font-semibold">{formatCurrency(expiring.premium)}</span>
                <span className="block text-xs text-muted-foreground">commission {formatCurrency(result.expiringCommission)}</span>
              </td>
              {rows.map((c) => (
                <td key={c.quote.id} className={cell}>
                  <span className="font-semibold">{formatCurrency(c.quote.premium)}</span> <span className="text-xs">{formatSignedPercent(c.premiumChange) ?? ""}</span>
                  <span className="block text-xs text-muted-foreground">commission {formatCurrency(c.commission)}</span>
                  <span className={cn("block text-xs", c.mismatches.length ? "text-red-800" : "text-muted-foreground")}>
                    {c.termsMatched} of {c.termsCompared} terms match
                  </span>
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={head}>
                Client cost
              </th>
              <td className={cell}>{formatCurrency(expiring.premium)}</td>
              {rows.map((c) => (
                <td key={c.quote.id} className={cell}>
                  {formatCurrency(c.quote.premium)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={head}>
                Broker commission
                <span className="block text-xs font-normal text-muted-foreground">premium × the quote&apos;s rate</span>
              </th>
              <td className={cell}>
                {formatCurrency(result.expiringCommission)} <span className="text-xs text-muted-foreground">({expiring.commissionRate}%)</span>
              </td>
              {rows.map((c) => (
                <td key={c.quote.id} className={cell}>
                  {formatCurrency(c.commission)} <span className="text-xs text-muted-foreground">({c.quote.commissionRate}%)</span>
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={head}>
                Premium change
              </th>
              <td className={cn(cell, "text-muted-foreground")}>—</td>
              {rows.map((c) => (
                <td key={c.quote.id} className={cell}>
                  {formatSignedPercent(c.premiumChange) ?? <Missing what="Premium change (no expiring premium)" />}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={head}>
                Rate <span className="block text-xs font-normal text-muted-foreground">{result.unitLabel}</span>
              </th>
              <td className={cell}>{result.expiringRate === null ? <Missing what="Expiring rate (exposure missing)" /> : result.expiringRate.toFixed(2)}</td>
              {rows.map((c) => (
                <td key={c.quote.id} className={cell}>
                  {c.rate === null ? <Missing what="Rate (exposure missing)" /> : c.rate.toFixed(2)}
                  {c.rateChange !== null ? <span className="block text-xs text-muted-foreground">{formatSignedPercent(c.rateChange)} vs expiring</span> : null}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={head}>
                Premium per $1M of limit
              </th>
              <td className={cell}>{expiring.occurrenceLimit ? formatCurrency((expiring.premium / expiring.occurrenceLimit) * 1_000_000) : "—"}</td>
              {rows.map((c) => (
                <td key={c.quote.id} className={cell}>
                  {c.premiumPerMillion === null ? <Missing what="Per $1M (no occurrence limit)" /> : formatCurrency(c.premiumPerMillion)}
                </td>
              ))}
            </tr>
            {terms.map((term) => (
              <tr key={term}>
                <th scope="row" className={head}>
                  {term === "occurrence" || term === "aggregate" || term === "deductible" ? TERM_LABEL[term] : ENDORSEMENT_LABELS[term]}
                </th>
                <td className={cell}>{expiringValue(expiring, term)}</td>
                {rows.map((c) => {
                  const t = c.terms.find((x) => x.term === term);
                  return (
                    <td key={c.quote.id} className={cn(cell, cellTone(t))}>
                      {quoteValue(c, term)}
                      {t && !t.matches ? <span className={cn("block text-xs", t.direction === "better" || t.direction === "added" ? "text-amber-900" : "text-red-800")}>{t.note}</span> : null}
                      {!t ? <span className="block text-xs text-muted-foreground">Not in the target</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="row" className={head}>
                Mismatches
              </th>
              <td className={cell} />
              {rows.map((c) => (
                <td key={c.quote.id} className={cn(cell, "text-xs")}>
                  {c.mismatches.length === 0 ? (
                    <span className="text-muted-foreground">None</span>
                  ) : (
                    <ul className="list-disc pl-4">
                      {c.mismatches.map((m) => (
                        <li key={m.term}>{m.note}</li>
                      ))}
                    </ul>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Red shading: below the target or missing (a higher deductible means more retained risk). Amber: broader than the target. Commission sits beside the client cost so the trade-off is visible.
      </p>
      <ShowMath lines={mathLines} />
    </div>
  );
}
