import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DaysBadge } from "@/components/book/BookTable";
import { Missing } from "@/components/Missing";
import { DashboardFilters } from "@/components/dashboard/DashboardFilters";
import { ExpiringChart } from "@/components/dashboard/ExpiringChart";
import { ForecastAssumptionsForm } from "@/components/dashboard/ForecastAssumptionsForm";
import { MetricTile } from "@/components/dashboard/MetricTile";
import { ShowMath } from "@/components/dashboard/ShowMath";
import { dashboardHref, type DashboardQuery } from "@/components/dashboard/params";
import { ReadinessMeter } from "@/components/renewals/ReadinessMeter";
import { renewalsHref } from "@/components/renewals/params";
import { LOST_REASON_LABELS } from "@/lib/constants";
import {
  ACCOUNT_FLAG_SHARE,
  CARRIER_FLAG_SHARE,
  DEFAULT_RETENTION,
  bookTiles,
  concentration,
  expiringByMonth,
  filterByProducer,
  forwardWindow,
  lookbackWindow,
  retention,
  revenueForecast,
  topExpiring,
  type ShareRow,
} from "@/lib/domain/dashboard";
import { formatCurrency, formatDate, formatRatioPercent } from "@/lib/format";
import { forecastAssumptionsSchema, parseForward, parseLookback } from "@/lib/schemas/dashboard";
import { loadDashboardInputs } from "@/server/dashboard/queries";
import { listMarketSubmissions } from "@/server/marketing/queries";
import { MarketLogTable } from "@/components/marketing/MarketLogTable";
import { marketLog } from "@/lib/domain/marketing";
import { requireWorkspace } from "../lib";

export const metadata: Metadata = { title: "Dashboard" };

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();

export default async function DashboardPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const ws = await requireWorkspace(slug);
  const asOf = ws.asOfDate;
  const inputs = await loadDashboardInputs(ws);

  const producer = inputs.producers.includes(first(sp.producer)) ? first(sp.producer) : "";
  const query: DashboardQuery = {
    producer,
    lookback: parseLookback(first(sp.lookback)),
    forward: parseForward(first(sp.forward)),
    retention: first(sp.retention),
    rate: first(sp.rate),
  };

  const lookback = lookbackWindow(asOf, query.lookback).value;
  const forward = forwardWindow(asOf, query.forward).value;
  const scope = filterByProducer(inputs.accounts, inputs.policies, producer || null).value;
  const { accounts, policies } = scope;
  const empty = policies.length === 0;

  const book = bookTiles(policies, asOf);
  const ret = retention(policies, accounts, lookback, asOf);
  const months = expiringByMonth(policies, forward);
  const top = topExpiring(policies, accounts, forward, asOf, 10);
  const conc = concentration(policies, accounts, asOf);
  const market = marketLog(await listMarketSubmissions(ws, producer ? accounts.map((a) => a.id) : undefined), lookback);

  // Forecast assumptions: URL values when valid, otherwise defaults.
  const defaultRetention = ret.value.premiumRetention ?? DEFAULT_RETENTION;
  const defaultRetentionPct = (defaultRetention * 100).toFixed(1).replace(/\.0$/, "");
  const parsedAssumptions = forecastAssumptionsSchema.safeParse({
    retention: query.retention || defaultRetentionPct,
    rateChange: query.rate || "0",
  });
  const invalidAssumptions = !parsedAssumptions.success && (query.retention !== "" || query.rate !== "");
  const assumptions = parsedAssumptions.success ? parsedAssumptions.data : { retention: Number(defaultRetentionPct), rateChange: 0 };
  const forecast = revenueForecast(policies, accounts, forward, { retention: assumptions.retention / 100, rateChange: assumptions.rateChange / 100 });
  const retentionHint =
    ret.value.premiumRetention !== null
      ? `Default ${formatRatioPercent(ret.value.premiumRetention)}: premium retention over the lookback window.`
      : `Default 85%: no premium retention to base it on.`;

  const r = ret.value;
  const b = book.value;
  const f = forecast.value;
  const c = conc.value;
  const chartBuckets = months.value.map((m) => ({ ...m, href: renewalsHref(slug, { producer, manager: "", line: "", carrier: "", stage: "", month: m.month, open: "1", view: "list", dir: "asc" }) }));
  const dash = (v: string | null) => (empty ? null : v);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Every figure is computed from the as-of date ({formatDate(asOf)}). Open &ldquo;Show the math&rdquo; on any tile to see how.</p>
        </div>
        <DashboardFilters slug={slug} query={query} producers={inputs.producers} />
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-muted/60 p-2.5">
            <dt className="text-xs text-muted-foreground">Lookback window (retention)</dt>
            <dd>
              {formatDate(lookback.start)} to {formatDate(lookback.end)}, trailing {lookback.months} months, both dates included
            </dd>
          </div>
          <div className="rounded-lg bg-muted/60 p-2.5">
            <dt className="text-xs text-muted-foreground">Forward window (expiring, forecast)</dt>
            <dd>
              {formatDate(forward.start)} to {formatDate(forward.end)}, next {forward.months} months, both dates included
            </dd>
          </div>
        </dl>
        {producer ? (
          <p className="text-sm font-medium" role="status">
            Showing {scope.shownAccounts} of {scope.totalAccounts} accounts (producer: {producer}).
          </p>
        ) : null}
        {empty ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border p-4 text-sm">
            <p>{producer ? `${producer} has no policies yet, so there is nothing to measure.` : "This workspace has no policies yet, so there is nothing to measure."}</p>
            <Button asChild variant="outline">
              <Link href={producer ? dashboardHref(slug, query, { producer: "" }) : `/w/${slug}/settings`}>{producer ? "Show all producers" : "Load the demo book in Settings"}</Link>
            </Button>
          </div>
        ) : null}
      </div>

      {/* ---------------- Book ---------------- */}
      <section aria-labelledby="book-heading" className="flex flex-col gap-3">
        <h2 id="book-heading" className="text-lg font-semibold">
          Book in force on {formatDate(asOf)}
        </h2>
        <p className="text-xs text-muted-foreground">In force means effective on or before the as-of date, expiring after it, and not lost or non-renewed.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MetricTile label="In-force premium" value={dash(formatCurrency(b.inForcePremium))} missing="In-force premium (no policies)" detail={`Sum over ${b.inForceCount} in-force policies`} lines={book.math.steps.lines as string[]} />
          <MetricTile label="In-force policies" value={dash(String(b.inForceCount))} missing="Policy count (no policies)" detail={`Of ${policies.length} policies on file`} lines={book.math.steps.lines as string[]} />
          <MetricTile
            label="Active accounts"
            value={dash(String(b.activeAccounts))}
            missing="Account count (no policies)"
            detail={`With at least one in-force policy, of ${accounts.length} accounts`}
            lines={book.math.steps.lines as string[]}
          />
          <MetricTile label="Booked commission" value={dash(formatCurrency(b.bookedCommission))} missing="Commission (no policies)" detail="Σ annual premium × commission rate, in-force policies" lines={book.math.steps.lines as string[]} />
          <MetricTile
            label="Average commission rate"
            value={dash(formatRatioPercent(b.averageCommissionRate))}
            missing="Average rate (no in-force premium)"
            detail="Premium-weighted: booked commission ÷ in-force premium"
            lines={book.math.steps.lines as string[]}
          />
        </div>
      </section>

      {/* ---------------- Retention ---------------- */}
      <section aria-labelledby="retention-heading" className="flex flex-col gap-3">
        <h2 id="retention-heading" className="text-lg font-semibold">
          Retention, {formatDate(lookback.start)} to {formatDate(lookback.end)}
        </h2>
        <p className="text-xs text-muted-foreground">
          Over the {r.resolvedCount} policies that expired in the lookback window and are resolved: renewed, lost, non-renewed, or expired with no outcome (treated as lost).
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <MetricTile
            label="Premium retention"
            value={dash(formatRatioPercent(r.premiumRetention))}
            missing="Premium retention (no resolved policies)"
            detail={
              <>
                {formatCurrency(r.renewedExpiringPremium)} renewed ÷ {formatCurrency(r.resolvedPremium)} resolved expiring premium
              </>
            }
            lines={ret.math.steps.lines as string[]}
          />
          <MetricTile
            label="Count retention"
            value={dash(formatRatioPercent(r.countRetention))}
            missing="Count retention (no resolved policies)"
            detail={
              <>
                {r.renewedCount} renewed ÷ {r.resolvedCount} resolved policies
              </>
            }
            lines={ret.math.steps.lines as string[]}
          />
          <MetricTile
            label="Renewed premium ratio"
            value={dash(formatRatioPercent(r.renewedPremiumRatio))}
            missing="Renewed premium ratio (no resolved policies)"
            detail={
              <>
                {formatCurrency(r.successorPremium)} renewal premium ÷ {formatCurrency(r.resolvedPremium)} resolved expiring premium. Can exceed 100% when rates rise.
              </>
            }
            note={r.successorsMissing > 0 ? `${r.successorsMissing} renewed ${r.successorsMissing === 1 ? "policy has" : "policies have"} no renewal policy on file, counted as $0.` : undefined}
            lines={ret.math.steps.lines as string[]}
          />
        </div>
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          <li>
            Resolved: {r.renewedCount} renewed, {r.lostCount} lost, {r.nonRenewedCount} non-renewed, {r.unresolvedCount} unresolved (treated as lost).
          </li>
          <li>
            Excluded: {r.excludedNotYetExpired} {r.excludedNotYetExpired === 1 ? "policy has" : "policies have"} an outcome but {r.excludedNotYetExpired === 1 ? "has" : "have"} not expired yet; {r.excludedNotYetExpired === 1 ? "it counts" : "they count"} once{" "}
            {r.excludedNotYetExpired === 1 ? "it expires" : "they expire"}.
          </li>
        </ul>

        <h3 className="text-base font-semibold">Lost business</h3>
        {r.lostRows.length === 0 ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">No lost, non-renewed or unresolved policies in the lookback window.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Line</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead className="text-right">Expiring premium</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Competing premium</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.lostRows.map((row) => (
                  <TableRow key={row.policyId}>
                    <TableCell className="font-medium">
                      <Link href={`/w/${slug}/accounts/${row.accountId}/policies/${row.policyId}`} className="hover:underline">
                        {row.accountName}
                      </Link>
                    </TableCell>
                    <TableCell>{row.lineOfBusiness}</TableCell>
                    <TableCell>{row.carrier}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(row.expiringPremium)}</TableCell>
                    <TableCell className="whitespace-normal">
                      {row.resolution === "unresolved" ? (
                        <Badge variant="destructive">Unresolved, treated as lost</Badge>
                      ) : row.resolution === "non_renewed" ? (
                        <>Non-renewed by carrier{row.reason ? `: ${row.reason}` : ""}</>
                      ) : (
                        <>Lost: {row.lostReason ? LOST_REASON_LABELS[row.lostReason] : "reason not recorded"}</>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.competingPremium === null ? <Missing what="Competing premium" /> : formatCurrency(row.competingPremium)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ---------------- Expiring premium ---------------- */}
      <section aria-labelledby="expiring-heading" className="flex flex-col gap-3">
        <h2 id="expiring-heading" className="text-lg font-semibold">
          Expiring premium, {formatDate(forward.start)} to {formatDate(forward.end)}
        </h2>
        <p className="text-xs text-muted-foreground">
          Open policies (no outcome yet) by expiry month: {formatCurrency(months.value.reduce((n, m) => n + m.premium, 0))} across {months.math.steps.openCount as number} policies. Select a month to open it in Renewals.
        </p>
        <div className="rounded-lg border p-3">
          <ExpiringChart buckets={chartBuckets} />
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <caption className="sr-only">Expiring premium by month, open policies</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Policies</TableHead>
                <TableHead className="text-right">Expiring premium</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chartBuckets.map((m) => (
                <TableRow key={m.month}>
                  <TableCell>
                    {m.count > 0 ? (
                      <Link href={m.href} className="underline-offset-4 hover:underline">
                        {m.label}
                      </Link>
                    ) : (
                      m.label
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{m.count}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(m.premium)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ShowMath lines={months.math.steps.lines as string[]} />

        <h3 className="text-base font-semibold">Top 10 expiring by premium</h3>
        {top.value.length === 0 ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">No open policies expire in the forward window.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Line · carrier</TableHead>
                  <TableHead className="text-right">Premium</TableHead>
                  <TableHead>Days to expiry</TableHead>
                  <TableHead>Readiness</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top.value.map((t) => (
                  <TableRow key={t.policyId}>
                    <TableCell className="font-medium">
                      <Link href={`/w/${slug}/accounts/${t.accountId}/policies/${t.policyId}`} className="hover:underline">
                        {t.accountName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {t.lineOfBusiness}
                      <span className="block text-xs text-muted-foreground">{t.carrier}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(t.premium)}</TableCell>
                    <TableCell>
                      <DaysBadge days={t.daysToExpiry} />
                    </TableCell>
                    <TableCell>
                      <ReadinessMeter readiness={t.readiness} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ---------------- Forecast ---------------- */}
      <section aria-labelledby="forecast-heading" className="flex flex-col gap-3">
        <h2 id="forecast-heading" className="text-lg font-semibold">
          Revenue forecast, {formatDate(forward.start)} to {formatDate(forward.end)}
        </h2>
        <p className="text-sm font-medium">A projection from the assumptions above, not a prediction.</p>
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <div className="rounded-lg border p-3">
            <ForecastAssumptionsForm
              key={`${assumptions.retention}|${assumptions.rateChange}`}
              slug={slug}
              query={query}
              current={{ retention: String(assumptions.retention), rateChange: String(assumptions.rateChange) }}
              retentionHint={retentionHint}
              isDefault={!query.retention && !query.rate}
            />
            {invalidAssumptions ? (
              <p className="mt-2 text-xs text-destructive" role="alert">
                The assumptions in the link were not valid, so the defaults are shown.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Forecast commission = Σ over {f.policyCount} open policies expiring in the window ({formatCurrency(f.expiringPremium)} expiring premium) of premium × retention × (1 + rate change) × the policy&apos;s
              commission rate.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(
                [
                  ["Low", f.low, "Retention − 10 points, rate change − 5 points"],
                  ["Base", f.base, "The assumptions as entered"],
                  ["High", f.high, "Retention + 10 points (max 100%), rate change + 5 points"],
                ] as const
              ).map(([name, s, how]) => (
                <MetricTile
                  key={name}
                  label={`${name} forecast commission`}
                  value={dash(formatCurrency(s.commission))}
                  missing="Forecast (no policies)"
                  detail={
                    <>
                      Retention {formatRatioPercent(s.retention)}, rate change {s.rateChange > 0 ? "+" : ""}
                      {formatRatioPercent(s.rateChange)}. {how}.
                    </>
                  }
                  lines={forecast.math.steps.lines as string[]}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Market log ---------------- */}
      <section aria-labelledby="market-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="market-heading" className="text-lg font-semibold">
            Market log, {formatDate(lookback.start)} to {formatDate(lookback.end)}
          </h2>
          <Link href={`/w/${slug}/market-log?lookback=${query.lookback}`} className="text-sm underline-offset-4 hover:underline">
            Open the market log
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">Per carrier, submissions sent in the lookback window. Hit ratio = quotes ÷ submissions; bind ratio = binds ÷ quotes.</p>
        <MarketLogTable carriers={market.value.carriers} total={market.value.total} compact />
        <ShowMath lines={market.math.steps.lines as string[]} />
      </section>

      {/* ---------------- Concentration ---------------- */}
      <section aria-labelledby="concentration-heading" className="flex flex-col gap-3">
        <h2 id="concentration-heading" className="text-lg font-semibold">
          Concentration of in-force premium
        </h2>
        <p className="text-xs text-muted-foreground">Percent of total in-force premium ({empty ? "—" : formatCurrency(c.totalPremium)}).</p>
        {c.flaggedCarriers.length > 0 || c.flaggedAccounts.length > 0 ? (
          <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              {c.flaggedCarriers.map((x) => (
                <p key={x.key}>
                  {x.label} holds {formatRatioPercent(x.share)} of in-force premium, above the {formatRatioPercent(CARRIER_FLAG_SHARE)} carrier guide.
                </p>
              ))}
              {c.flaggedAccounts.map((x) => (
                <p key={x.key}>
                  {x.label} is {formatRatioPercent(x.share)} of in-force premium, above the {formatRatioPercent(ACCOUNT_FLAG_SHARE)} account guide.
                </p>
              ))}
              <p className="text-muted-foreground">Concentration is a revenue risk to the brokerage to be aware of, not a verdict on the carrier or the client.</p>
            </div>
          </div>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-3">
          <ShareTable title="By carrier" rows={c.byCarrier} />
          <ShareTable title="By line" rows={c.byLine} />
          <ShareTable title="Top 5 accounts" rows={c.topAccounts} />
        </div>
        <ShowMath lines={conc.math.steps.lines as string[]} />
      </section>
    </div>
  );
}

function ShareTable({ title, rows }: { title: string; rows: ShareRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground">
          <Missing what="In-force premium" /> No in-force premium.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{title === "By line" ? "Line" : title === "By carrier" ? "Carrier" : "Account"}</TableHead>
                <TableHead className="text-right">Premium</TableHead>
                <TableHead className="text-right">% of total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="whitespace-normal">
                    {r.label}
                    {r.flagged ? (
                      <Badge variant="outline" className="ml-1.5 align-middle">
                        Concentrated
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(r.premium)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRatioPercent(r.share)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
