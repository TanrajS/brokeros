import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KanbanSquare, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RenewalBoard } from "@/components/renewals/RenewalBoard";
import { RenewalFilters } from "@/components/renewals/RenewalFilters";
import { RenewalList } from "@/components/renewals/RenewalList";
import { StageRulesPanel } from "@/components/renewals/StageRulesPanel";
import { SummaryStrip } from "@/components/renewals/SummaryStrip";
import { renewalsHref, type RenewalsQuery } from "@/components/renewals/params";
import { formatDate } from "@/lib/format";
import { isRenewalStage, listRenewals } from "@/server/renewals/queries";
import { requireWorkspace } from "../lib";

export const metadata: Metadata = { title: "Renewals" };

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();

export default async function RenewalsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const ws = await requireWorkspace(slug);

  const stage = first(sp.stage);
  const query: RenewalsQuery = {
    producer: first(sp.producer),
    manager: first(sp.manager),
    line: first(sp.line),
    carrier: first(sp.carrier),
    stage: isRenewalStage(stage) ? stage : "",
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(first(sp.month)) ? first(sp.month) : "",
    open: first(sp.open) === "1" ? "1" : "",
    view: first(sp.view) === "list" ? "list" : "board",
    dir: first(sp.dir) === "desc" ? "desc" : "asc",
  };
  // The filter form submits every select, including "All" (empty). Redirect to the
  // canonical URL so a shared link carries only the filters that are active.
  const hasEmpty = (["producer", "manager", "line", "carrier", "stage", "month", "open"] as const).some((k) => k in sp && first(sp[k]) === "");
  const invalid = (stage !== "" && query.stage === "") || (first(sp.month) !== "" && query.month === "");
  if (hasEmpty || invalid) redirect(renewalsHref(slug, query));

  const data = await listRenewals(ws, query, query.dir);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Renewals</h1>
          <p className="text-sm text-muted-foreground">
            Every policy by renewal stage, counted from the as-of date ({formatDate(ws.asOfDate)}). Showing {data.rows.length} of {data.totalPolicies}{" "}
            {data.totalPolicies === 1 ? "policy" : "policies"}.
          </p>
        </div>
        <nav aria-label="Renewals view" className="flex gap-1 rounded-lg border p-1">
          <Button asChild size="sm" variant={query.view === "board" ? "default" : "ghost"}>
            <Link href={renewalsHref(slug, query, { view: "board" })} aria-current={query.view === "board" ? "page" : undefined}>
              <KanbanSquare aria-hidden="true" />
              Board
            </Link>
          </Button>
          <Button asChild size="sm" variant={query.view === "list" ? "default" : "ghost"}>
            <Link href={renewalsHref(slug, query, { view: "list" })} aria-current={query.view === "list" ? "page" : undefined}>
              <List aria-hidden="true" />
              List
            </Link>
          </Button>
        </nav>
      </div>

      <RenewalFilters slug={slug} query={query} options={data.options} />
      <SummaryStrip slug={slug} query={query} summary={data.summary} overdueTasks={data.overdueTasks} />

      {data.totalPolicies === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">
          No policies yet. Add policies to accounts in the{" "}
          <Link href={`/w/${slug}`} className="underline">
            Book
          </Link>{" "}
          or load the demo book in Settings.
        </p>
      ) : data.rows.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">No policies match these filters.</p>
      ) : query.view === "board" ? (
        <RenewalBoard slug={slug} rows={data.rows} />
      ) : (
        <RenewalList slug={slug} query={query} rows={data.rows} />
      )}


      <StageRulesPanel asOf={formatDate(ws.asOfDate) ?? ws.asOfDate} />
    </div>
  );
}
