import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getRateMetrics } from "@/lib/domain/renewals";
import { EXPOSURE_BASIS_LABELS } from "@/lib/constants";
import { formatCurrency, formatInteger, formatRate, formatSignedPercent } from "@/lib/format";
import { Missing } from "@/components/Missing";
import type { Policy } from "@/server/db/schema";

interface Props {
  title: string;
  expiring: Policy;
  renewal: Policy;
  /** Link for whichever side is not the page you're on. */
  otherHref: string;
  otherLabel: string;
}

function exposureText(p: Policy): string | null {
  if (p.exposureAmount === null) return null;
  return p.exposureBasis === "revenue" || p.exposureBasis === "payroll" ? formatCurrency(p.exposureAmount) : formatInteger(p.exposureAmount);
}

/** Expiring vs renewal: premium change, exposure change and rate change, with the math. */
export function RateChangePanel({ title, expiring, renewal, otherHref, otherLabel }: Props) {
  const calc = getRateMetrics(
    { premium: expiring.annualPremium, exposureAmount: expiring.exposureAmount, exposureBasis: expiring.exposureBasis },
    { premium: renewal.annualPremium, exposureAmount: renewal.exposureAmount, exposureBasis: renewal.exposureBasis },
  );
  const m = calc.value;
  const lines = calc.math.steps.lines as string[];
  const rateMissing = `— (${m.rateUnavailable ?? "unavailable"})`;

  return (
    <section aria-labelledby="rate-heading" className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rate-heading" className="text-lg font-semibold">
          {title}
        </h2>
        <Link href={otherHref} className="text-sm underline-offset-4 hover:underline">
          {otherLabel}
        </Link>
      </div>

      <p className="text-base font-medium">{m.sentence}</p>

      {m.warning ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {m.warning}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-md text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th scope="col" className="py-1.5 pr-3 text-left font-medium">
                <span className="sr-only">Measure</span>
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                Expiring
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">
                Renewal
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Change
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <tr className="border-b">
              <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                Carrier
              </th>
              <td className="py-1.5 pr-3 text-right">{expiring.carrier}</td>
              <td className="py-1.5 pr-3 text-right">{renewal.carrier}</td>
              <td className="py-1.5 text-right text-muted-foreground">{expiring.carrier === renewal.carrier ? "Same" : "Changed"}</td>
            </tr>
            <tr className="border-b">
              <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                Premium
              </th>
              <td className="py-1.5 pr-3 text-right">{formatCurrency(expiring.annualPremium)}</td>
              <td className="py-1.5 pr-3 text-right">{formatCurrency(renewal.annualPremium)}</td>
              <td className="py-1.5 text-right font-medium">{formatSignedPercent(m.premiumChange) ?? <Missing what="Expiring premium" />}</td>
            </tr>
            <tr className="border-b">
              <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                Exposure ({EXPOSURE_BASIS_LABELS[expiring.exposureBasis].toLowerCase()})
              </th>
              <td className="py-1.5 pr-3 text-right">{exposureText(expiring) ?? <Missing what="Expiring exposure" />}</td>
              <td className="py-1.5 pr-3 text-right">{exposureText(renewal) ?? <Missing what="Renewal exposure" />}</td>
              <td className="py-1.5 text-right font-medium">{formatSignedPercent(m.exposureChange) ?? rateMissing}</td>
            </tr>
            <tr>
              <th scope="row" className="py-1.5 pr-3 text-left font-medium">
                Rate <span className="font-normal text-muted-foreground">({m.unitLabel})</span>
              </th>
              <td className="py-1.5 pr-3 text-right">{formatRate(m.expiringRate) ?? "—"}</td>
              <td className="py-1.5 pr-3 text-right">{formatRate(m.renewalRate) ?? "—"}</td>
              <td className="py-1.5 text-right font-medium">{formatSignedPercent(m.rateChange) ?? rateMissing}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <details className="rounded-lg bg-muted/50 p-3 text-sm">
        <summary className="cursor-pointer rounded-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">Show the math</summary>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 font-mono text-xs">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">
          Identity check: (1 + premium change) = (1 + rate change) × (1 + exposure change), within 0.0001.{" "}
          {m.identity ? (m.identity.holds ? "Holds." : "Fails.") : "Not applicable without both exposures."}
        </p>
      </details>
    </section>
  );
}
