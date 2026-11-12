"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Missing, ValueOrMissing } from "@/components/Missing";
import { describeDays, formatCurrency, formatDate, titleCase } from "@/lib/format";
import type { BookRow, BookSortKey } from "@/server/accounts/queries";

interface Props {
  slug: string;
  rows: BookRow[];
  sort: BookSortKey;
  dir: "asc" | "desc";
  q: string;
}

const columns: { key: BookSortKey; label: string; align?: "right" }[] = [
  { key: "name", label: "Account" },
  { key: "industry", label: "Industry" },
  { key: "producer", label: "Producer" },
  { key: "policyCount", label: "Policies", align: "right" },
  { key: "totalPremium", label: "Annual premium", align: "right" },
  { key: "nextExpiry", label: "Next expiry" },
];

export function BookTable({ slug, rows, sort, dir, q }: Props) {
  const router = useRouter();

  function sortHref(key: BookSortKey) {
    const nextDir = sort === key && dir === "asc" ? "desc" : "asc";
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("sort", key);
    params.set("dir", nextDir);
    return `/w/${slug}?${params.toString()}`;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => {
              const active = sort === c.key;
              const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <TableHead
                  key={c.key}
                  aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
                  className={c.align === "right" ? "text-right" : undefined}
                >
                  <Link
                    href={sortHref(c.key)}
                    className="inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {c.label}
                    <Icon className="size-3.5 opacity-60" aria-hidden="true" />
                  </Link>
                </TableHead>
              );
            })}
            <TableHead>Days to expiry</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const href = `/w/${slug}/accounts/${r.id}`;
            return (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={(e) => {
                  // Let real links and text selection behave normally.
                  if ((e.target as HTMLElement).closest("a")) return;
                  if (window.getSelection()?.toString()) return;
                  router.push(href);
                }}
              >
                <TableCell className="font-medium">
                  <Link href={href} className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                    {r.name}
                  </Link>
                  {r.status !== "active" ? (
                    <Badge variant="secondary" className="ml-2 align-middle">
                      {titleCase(r.status)}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell>{titleCase(r.industry)}</TableCell>
                <TableCell>
                  <ValueOrMissing text={r.producer} what="Producer" />
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.policyCount}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.policyCount === 0 ? <Missing what="Premium (no policies)" /> : formatCurrency(r.totalPremium)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.nextExpiry ? formatDate(r.nextExpiry) : <Missing what="Expiry (no policies)" />}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.daysToExpiry === null ? <Missing what="Days to expiry (no policies)" /> : <DaysBadge days={r.daysToExpiry} />}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function DaysBadge({ days }: { days: number }) {
  const tone = days < 0 ? "destructive" : days <= 60 ? "default" : "outline";
  return (
    <Badge variant={tone} className="tabular-nums">
      {days} {Math.abs(days) === 1 ? "day" : "days"}
      <span className="sr-only"> ({describeDays(days)})</span>
    </Badge>
  );
}
