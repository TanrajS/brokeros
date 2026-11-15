import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, FileText } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { ComparisonTable, sortComparisons } from "@/components/marketing/ComparisonTable";
import { SubmissionsSection } from "@/components/marketing/SubmissionsSection";
import { marketingHref, parseMarketingQuery } from "@/components/marketing/params";
import { ReadinessMeter } from "@/components/renewals/ReadinessMeter";
import { checklistReadiness, checklistTemplate } from "@/lib/domain/renewals";
import { formatCurrency, formatDate } from "@/lib/format";
import { loadChecklist } from "@/server/marketing/queries";
import { buildMarketingView } from "@/server/marketing/view";
import { requireWorkspace } from "../../../../lib";

export const metadata: Metadata = { title: "Marketing" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function MarketingPage({ params, searchParams }: { params: Promise<{ slug: string; accountId: string }>; searchParams: Promise<SearchParams> }) {
  const [{ slug, accountId }, sp] = await Promise.all([params, searchParams]);
  const ws = await requireWorkspace(slug);
  const q = parseMarketingQuery(sp);
  const view = await buildMarketingView(ws, accountId, q);
  if (!view) notFound();
  const { choices, policy } = view;

  if (!policy) {
    return (
      <p className="rounded-lg border p-6 text-sm text-muted-foreground">
        No policy on this account is in renewal (open, with no outcome recorded). Marketing starts once a renewal is underway.
      </p>
    );
  }
  const { expiring, target, comparison, normalised, submissionViews, requirement, data, policyHasOutcome } = view;
  const query = { ...q, policy: policy.id };
  const href = (patch: Partial<typeof query>) => marketingHref(slug, accountId, query, patch);

  const stored = await loadChecklist(ws.id, policy.id);
  const items = stored.length ? stored.map((c) => ({ label: c.label, done: c.done })) : checklistTemplate(policy.lineOfBusiness).value.map((t) => ({ label: t.label, done: false }));
  const readiness = checklistReadiness(items.filter((i) => i.done).length, items.length).value;

  const shown = sortComparisons(q.normalise ? normalised.value.included : comparison.value.quotes, q.sort);
  const policyLabel = (p: (typeof choices)[number]) => `${p.lineOfBusiness} · ${p.carrier} · expires ${formatDate(p.expiryDate)}`;

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Policy being marketed" className="flex flex-wrap gap-1.5">
        {choices.map((p) => (
          <Link
            key={p.id}
            href={marketingHref(slug, accountId, { ...query, policy: p.id, target: "" })}
            aria-current={p.id === policy.id ? "page" : undefined}
            className={cn("inline-flex rounded-full border px-3 py-1 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", p.id === policy.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {policyLabel(p)}
          </Link>
        ))}
      </nav>

      {/* ---------- Submission package ---------- */}
      <section aria-labelledby="package-heading" className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="package-heading" className="text-lg font-semibold">
            Submission package
          </h2>
          <Button asChild variant="outline" size="sm">
            <Link href={marketingHref(slug, accountId, query, {}, "/summary")}>
              <FileText aria-hidden="true" />
              Submission summary
            </Link>
          </Button>
        </div>
        <ReadinessMeter readiness={readiness} notOpened={stored.length === 0} className="max-w-xs" />
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {items.map((i) => (
            <li key={i.label} className="flex items-center gap-2">
              {i.done ? <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" /> : <Circle className="size-4 text-muted-foreground" aria-hidden="true" />}
              <span className={i.done ? undefined : "text-muted-foreground"}>
                {i.label}
                <span className="sr-only">{i.done ? " (complete)" : " (outstanding)"}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Documents come from the readiness checklist;{" "}
          <Link href={`/w/${slug}/accounts/${accountId}/policies/${policy.id}`} className="underline underline-offset-2">
            tick them on the policy page
          </Link>
          . The summary assembles the account profile, exposure, expiring terms, five-year losses and target terms on one printable page. Nothing is sent from the app.
        </p>
      </section>

      <SubmissionsSection
        slug={slug}
        policyId={policy.id}
        asOf={ws.asOfDate}
        rows={submissionViews}
        policyHasOutcome={policyHasOutcome}
        expiring={{
          carrier: policy.carrier,
          occurrenceLimit: policy.occurrenceLimit,
          aggregateLimit: policy.aggregateLimit,
          deductible: policy.deductible,
          endorsements: policy.endorsements,
          commissionRate: policy.commissionRate,
          exposureAmount: policy.exposureAmount,
        }}
      />

      {/* ---------- Comparison ---------- */}
      <section aria-labelledby="compare-heading" className="flex flex-col gap-3">
        <h2 id="compare-heading" className="text-lg font-semibold">
          Like-for-like comparison
        </h2>
        <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Compare against:</span>
            <Link href={href({ target: "" })} aria-current={!requirement ? "true" : undefined} className={cn("rounded-full border px-2.5 py-0.5", !requirement ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
              Expiring terms
            </Link>
            {data.requirements.map((r) => (
              <Link key={r.id} href={href({ target: r.id })} aria-current={requirement?.id === r.id ? "true" : undefined} className={cn("rounded-full border px-2.5 py-0.5", requirement?.id === r.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {r.contractName}: {r.coverage}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">View:</span>
            <Link href={href({ normalise: false })} aria-current={!q.normalise ? "true" : undefined} className={cn("rounded-full border px-2.5 py-0.5", !q.normalise ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
              All quotes
            </Link>
            <Link href={href({ normalise: true })} aria-current={q.normalise ? "true" : undefined} className={cn("rounded-full border px-2.5 py-0.5", q.normalise ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
              Normalise
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">
            {target.kind === "expiring"
              ? "Against the expiring terms, a term matches only when it is the same. "
              : "Against a contract requirement, a limit matches when it meets the requirement and only the required endorsements are checked; the deductible is not specified. "}
            Normalise keeps only quotes whose limits and deductible match the target, so what remains differs on price (endorsement differences stay visible).
          </p>
        </div>

        {comparison.value.quotes.length === 0 ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">No quotes recorded yet. Record quotes against submitted carriers above to compare them.</p>
        ) : (
          <>
            {q.normalise ? (
              <p className="text-sm" role="status">
                Showing {normalised.value.included.length} of {comparison.value.quotes.length} quotes.{" "}
                {normalised.value.excluded.length === 0
                  ? "None excluded: every quote matches the target on limits and deductible."
                  : `${normalised.value.excluded.length} excluded because their terms differ from the target: ${normalised.value.excluded.map((x) => `${x.comparison.quote.carrier} (${x.reasons.join("; ")})`).join("; ")}.`}
              </p>
            ) : null}
            {shown.length > 0 ? (
              <ComparisonTable
                expiring={expiring}
                result={comparison.value}
                rows={shown}
                sort={q.sort}
                sortHref={(k) => href({ sort: k })}
                mathLines={[...(comparison.math.steps.lines as string[]), ...(q.normalise ? (normalised.math.steps.lines as string[]) : [])]}
              />
            ) : (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">No quote matches the target on limits and deductible.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Expiring premium {formatCurrency(expiring.premium)}. Premium change = quoted ÷ expiring − 1. The terms count lists every mismatch; there is no combined score.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
