import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PrintButton } from "@/components/marketing/PrintButton";
import { marketingHref, parseMarketingQuery } from "@/components/marketing/params";
import { ENDORSEMENT_LABELS, EXPOSURE_BASIS_LABELS } from "@/lib/constants";
import { policyYearSummary } from "@/lib/domain/lossRuns";
import { formatLimit } from "@/lib/domain/money";
import { formatCurrency, formatDate, formatInteger, formatRatioPercent, titleCase } from "@/lib/format";
import { loadLossRunInputs } from "@/server/lossRuns/queries";
import { buildMarketingView } from "@/server/marketing/view";
import { requireWorkspace } from "../../../../lib";

export const metadata: Metadata = { title: "Submission summary" };

type SearchParams = Record<string, string | string[] | undefined>;

/** One printable page: account profile, operations, exposure, expiring terms, five-year losses and target terms. */
export default async function SubmissionSummaryPage({ params, searchParams }: { params: Promise<{ slug: string; accountId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ slug, accountId }, sp] = await Promise.all([params, searchParams]);
  const ws = await requireWorkspace(slug);
  const q = parseMarketingQuery(sp);
  const [view, losses] = await Promise.all([buildMarketingView(ws, accountId, q), loadLossRunInputs(ws, accountId)]);
  if (!view || !view.policy || !losses) notFound();
  const { policy, target, data } = view;
  const a = data.account;
  const s = policyYearSummary({ claims: losses.claims, policies: losses.policies, line: policy.lineOfBusiness, asOf: ws.asOfDate, adjustments: { trendRate: null, factors: null } }).value;
  const exposure =
    policy.exposureAmount === null ? "Not entered" : policy.exposureBasis === "revenue" || policy.exposureBasis === "payroll" ? formatCurrency(policy.exposureAmount) : formatInteger(policy.exposureAmount);
  const dl = "grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1 text-sm print:text-xs";

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-5 print:max-w-none print:gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={marketingHref(slug, accountId, { ...q, policy: policy.id })} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Marketing
        </Link>
        <PrintButton />
      </div>

      <header className="border-b pb-3">
        <h2 className="text-xl font-semibold">Submission summary: {a.name}</h2>
        <p className="text-sm text-muted-foreground">
          {policy.lineOfBusiness} renewal, effective {formatDate(policy.expiryDate)}. Prepared as of {formatDate(ws.asOfDate)}.
        </p>
      </header>

      <section aria-labelledby="sum-profile">
        <h3 id="sum-profile" className="mb-1 font-semibold">
          Account profile
        </h3>
        <dl className={dl}>
          <dt className="text-muted-foreground">Industry</dt>
          <dd>{titleCase(a.industry)}</dd>
          <dt className="text-muted-foreground">Province</dt>
          <dd>{a.province}</dd>
          <dt className="text-muted-foreground">Annual revenue</dt>
          <dd>{formatCurrency(a.annualRevenue) ?? "Not entered"}</dd>
          <dt className="text-muted-foreground">Employees</dt>
          <dd>{formatInteger(a.employeeCount) ?? "Not entered"}</dd>
          <dt className="text-muted-foreground">Operations</dt>
          <dd>{a.notes ?? "Not entered"}</dd>
        </dl>
      </section>

      <section aria-labelledby="sum-exposure">
        <h3 id="sum-exposure" className="mb-1 font-semibold">
          Exposure and expiring terms
        </h3>
        <dl className={dl}>
          <dt className="text-muted-foreground">Exposure</dt>
          <dd>
            {exposure} ({EXPOSURE_BASIS_LABELS[policy.exposureBasis].toLowerCase()})
          </dd>
          <dt className="text-muted-foreground">Carrier</dt>
          <dd>{policy.carrier}</dd>
          <dt className="text-muted-foreground">Term</dt>
          <dd>
            {formatDate(policy.effectiveDate)} to {formatDate(policy.expiryDate)}
          </dd>
          <dt className="text-muted-foreground">Premium</dt>
          <dd>{formatCurrency(policy.annualPremium)}</dd>
          <dt className="text-muted-foreground">Limits</dt>
          <dd>{formatLimit(policy.occurrenceLimit, policy.aggregateLimit).value}</dd>
          <dt className="text-muted-foreground">Deductible</dt>
          <dd>{formatCurrency(policy.deductible) ?? "None"}</dd>
          <dt className="text-muted-foreground">Endorsements</dt>
          <dd>{policy.endorsements.length ? policy.endorsements.map((e) => ENDORSEMENT_LABELS[e]).join(", ") : "None"}</dd>
        </dl>
      </section>

      <section aria-labelledby="sum-losses">
        <h3 id="sum-losses" className="mb-1 font-semibold">
          Five-year loss summary ({policy.lineOfBusiness})
        </h3>
        {s.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No policy years on file for this line.</p>
        ) : (
          <table className="w-full text-sm print:text-xs">
            <thead>
              <tr className="border-b text-left">
                <th scope="col" className="py-1 pr-2 font-medium">
                  Policy year
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  Claims
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  Open
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  Incurred
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  Earned premium
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Loss ratio
                </th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {s.rows.slice(-5).map((r) => (
                <tr key={r.period.policyId} className="border-b">
                  <th scope="row" className="py-1 pr-2 text-left font-normal">
                    {r.label}
                    {r.earnedToDate ? " (to date)" : ""}
                  </th>
                  <td className="py-1 pr-2 text-right">{r.claimCount}</td>
                  <td className="py-1 pr-2 text-right">{r.openCount}</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(r.incurred)}</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(r.earnedPremium)}</td>
                  <td className="py-1 text-right">{formatRatioPercent(r.lossRatio) ?? "—"}</td>
                </tr>
              ))}
              {s.total ? (
                <tr className="font-semibold">
                  <th scope="row" className="py-1 pr-2 text-left">
                    {s.total.label}
                  </th>
                  <td className="py-1 pr-2 text-right">{s.total.claimCount}</td>
                  <td className="py-1 pr-2 text-right">{s.total.openCount}</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(s.total.incurred)}</td>
                  <td className="py-1 pr-2 text-right">{formatCurrency(s.total.earnedPremium)}</td>
                  <td className="py-1 text-right">{formatRatioPercent(s.total.lossRatio) ?? "—"}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="sum-target">
        <h3 id="sum-target" className="mb-1 font-semibold">
          Target terms
        </h3>
        <p className="mb-1 text-xs text-muted-foreground">{target.kind === "expiring" ? "As expiring." : `From the contract requirement: ${target.label}.`}</p>
        <dl className={dl}>
          <dt className="text-muted-foreground">Occurrence limit</dt>
          <dd>{formatCurrency(target.occurrenceLimit) ?? "Not specified"}</dd>
          <dt className="text-muted-foreground">Aggregate limit</dt>
          <dd>{formatCurrency(target.aggregateLimit) ?? "Not specified"}</dd>
          <dt className="text-muted-foreground">Deductible</dt>
          <dd>{target.deductible === null ? (target.kind === "expiring" ? "None" : "Not specified") : formatCurrency(target.deductible)}</dd>
          <dt className="text-muted-foreground">Endorsements</dt>
          <dd>{target.endorsements.length ? target.endorsements.map((e) => ENDORSEMENT_LABELS[e]).join(", ") : "None"}</dd>
        </dl>
      </section>

      <footer className="border-t pt-2 text-xs text-muted-foreground">Assembled in Broker OS from the account&apos;s records. All demo data is fictional.</footer>
    </article>
  );
}
