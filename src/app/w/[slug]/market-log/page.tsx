import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/form/NativeSelect";
import { ShowMath } from "@/components/dashboard/ShowMath";
import { MarketLogTable } from "@/components/marketing/MarketLogTable";
import { LOOKBACK_MONTHS, lookbackWindow } from "@/lib/domain/dashboard";
import { marketLog } from "@/lib/domain/marketing";
import { formatDate } from "@/lib/format";
import { parseLookback } from "@/lib/schemas/dashboard";
import { listMarketSubmissions } from "@/server/marketing/queries";
import { requireWorkspace } from "../lib";

export const metadata: Metadata = { title: "Market log" };

type SearchParams = Record<string, string | string[] | undefined>;

/** Workspace-wide market log: every carrier approached across every account. */
export default async function MarketOverviewPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const ws = await requireWorkspace(slug);
  const months = parseLookback(Array.isArray(sp.lookback) ? (sp.lookback[0] ?? "") : (sp.lookback ?? ""));
  const window = lookbackWindow(ws.asOfDate, months).value;
  const subs = await listMarketSubmissions(ws);
  const log = marketLog(subs, window);

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/w/${slug}/dashboard`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Dashboard
      </Link>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Market log</h1>
        <p className="text-sm text-muted-foreground">
          Every carrier approached across the book, for submissions sent between {formatDate(window.start)} and {formatDate(window.end)} (trailing {months} months).
        </p>
      </div>
      <form action={`/w/${slug}/placement/marketing`} method="get" className="flex items-end gap-2" aria-label="Market log window">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ml-lookback">Lookback</Label>
          <NativeSelect id="ml-lookback" name="lookback" defaultValue={String(months)}>
            {LOOKBACK_MONTHS.map((m) => (
              <option key={m} value={m}>
                Trailing {m} months
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          Apply
        </Button>
      </form>
      <MarketLogTable carriers={log.value.carriers} total={log.value.total} />
      <p className="text-xs text-muted-foreground">
        Hit ratio = quotes ÷ submissions (a carrier quoting several options counts once). Bind ratio = binds ÷ quotes. Days to respond run from the sent date to the quote or decline.
        A carrier with three or more submissions and no quotes is flagged.
      </p>
      <ShowMath lines={log.math.steps.lines as string[]} />
    </div>
  );
}
