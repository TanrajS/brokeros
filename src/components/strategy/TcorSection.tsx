import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Missing } from "@/components/Missing";
import { ShowMath } from "@/components/dashboard/ShowMath";
import type { LineOfBusiness } from "@/lib/constants";
import { TCOR_COMPONENT_LABELS, type Tcor } from "@/lib/domain/strategy";
import { formatCurrency } from "@/lib/format";
import { TcorChart, type TcorPoint } from "./TcorChart";
import { TcorFeesForm } from "./TcorFeesForm";

export interface OtherLineRow {
  line: LineOfBusiness;
  carriers: string[];
  premium: number;
  deductible: number | null;
  averageRetained: number | null;
  reason: string | null;
  mathLines: string[];
}

interface Props {
  slug: string;
  accountId: string;
  line: LineOfBusiness;
  fees: { brokerFees: number; riskControlSpend: number; claimsAdminCost: number };
  revenue: number | null;
  otherLines: OtherLineRow[];
  tcor: Tcor[];
  /** One option's premium and average retained, in the same order as `tcor`. */
  optionInputs: { premium: number; averageRetained: number }[];
  mathLines: string[][];
  print?: boolean;
}

const money = (n: number | null | undefined) => formatCurrency(n) ?? "—";
const pct2 = (ratio: number) => `${(ratio * 100).toFixed(2)}%`;

/** TCOR per option side by side: the five components, the total, and the total against revenue. */
export function TcorSection({ slug, accountId, line, fees, revenue, otherLines, tcor, optionInputs, mathLines, print = false }: Props) {
  const head = cn("px-3 py-2 text-left font-medium align-top", print && "px-2 py-1");
  const cell = cn("px-3 py-2 align-top tabular-nums", print && "px-2 py-1");
  const points: TcorPoint[] = tcor.map((t) => ({ label: t.optionLabel, total: t.total, ...t.components }));
  const otherPremium = otherLines.reduce((s, l) => s + l.premium, 0);
  const unit = (text: string) => <span className="block text-xs font-normal text-muted-foreground">{text}</span>;

  const table =
    tcor.length === 0 ? (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">Total cost of risk is computed per retention option. Add an option above.</p>
    ) : (
      <div className="relative overflow-x-auto rounded-lg border">
        <table className={cn("w-full min-w-[36rem]", print ? "text-xs" : "text-sm")}>
          <caption className="sr-only">Total cost of risk by retention option</caption>
          <thead className="border-b bg-muted/40">
            <tr>
              <th scope="col" className={cn(head, "w-48")}>
                <span className="sr-only">Component</span>
              </th>
              {tcor.map((t) => (
                <th key={t.optionLabel} scope="col" className={head}>
                  {t.optionLabel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <th scope="row" className={head}>
                {TCOR_COMPONENT_LABELS.premiums}
                {unit("$ per year: in-force premiums, with the option's premium for " + line)}
              </th>
              {tcor.map((t, i) => (
                <td key={t.optionLabel} className={cell}>
                  {money(t.components.premiums)}
                  <span className="block text-xs text-muted-foreground">
                    {money(optionInputs[i]?.premium)} {line} + {money(otherPremium)} other lines
                  </span>
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={head}>
                {TCOR_COMPONENT_LABELS.retained}
                {unit("$ per year: option's average retained + other lines below their deductibles")}
              </th>
              {tcor.map((t, i) => (
                <td key={t.optionLabel} className={cell}>
                  {money(t.components.retained)}
                  <span className="block text-xs text-muted-foreground">
                    {money(optionInputs[i]?.averageRetained)} {line}
                    {otherLines.length ? ` + ${money(otherLines.reduce((s, l) => s + (l.averageRetained ?? 0), 0))} other lines` : ""}
                  </span>
                  {t.flagged.length ? <span className="block text-xs text-amber-900">{t.flagged.join(", ")}: no loss runs, counted as $0</span> : null}
                </td>
              ))}
            </tr>
            {(["brokerFees", "riskControl", "claimsAdmin"] as const).map((k) => (
              <tr key={k}>
                <th scope="row" className={head}>
                  {TCOR_COMPONENT_LABELS[k]}
                  {unit("$ per year, entered")}
                </th>
                {tcor.map((t) => (
                  <td key={t.optionLabel} className={cell}>
                    {money(t.components[k])}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-muted/20 font-semibold">
              <th scope="row" className={head}>
                Total cost of risk
                {unit("$ per year")}
              </th>
              {tcor.map((t) => (
                <td key={t.optionLabel} className={cell}>
                  {money(t.total)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={head}>
                As a share of revenue
                {unit(revenue !== null ? `% of ${money(revenue)}` : "% of annual revenue")}
              </th>
              {tcor.map((t) => (
                <td key={t.optionLabel} className={cell}>
                  {t.percentOfRevenue === null ? <Missing what="Annual revenue" /> : pct2(t.percentOfRevenue)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className={head}>
                Per $1,000 of revenue
                {unit("$")}
              </th>
              {tcor.map((t) => (
                <td key={t.optionLabel} className={cell}>
                  {t.perThousandRevenue === null ? <Missing what="Annual revenue" /> : formatCurrency(t.perThousandRevenue, { cents: true })}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    );

  const otherLinesTable =
    otherLines.length === 0 ? null : (
      <div className="relative overflow-x-auto rounded-lg border">
        <table className={cn("w-full min-w-[30rem]", print ? "text-xs" : "text-sm")}>
          <caption className="sr-only">Other in-force lines included in the total cost of risk</caption>
          <thead className="border-b bg-muted/40">
            <tr>
              <th scope="col" className={head}>
                Other in-force line
              </th>
              <th scope="col" className={head}>
                Carrier
              </th>
              <th scope="col" className={cn(head, "text-right")}>
                Premium ($ per year)
              </th>
              <th scope="col" className={cn(head, "text-right")}>
                Deductible ($)
              </th>
              <th scope="col" className={cn(head, "text-right")}>
                Expected retained ($ per year)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {otherLines.map((l) => (
              <tr key={l.line}>
                <th scope="row" className={cn(head, "font-medium")}>
                  {l.line}
                </th>
                <td className={cell}>{l.carriers.join(", ")}</td>
                <td className={cn(cell, "text-right")}>{money(l.premium)}</td>
                <td className={cn(cell, "text-right")}>{l.deductible === null ? <Missing what="Deductible" /> : money(l.deductible)}</td>
                <td className={cn(cell, "text-right")}>
                  {l.averageRetained === null ? (
                    <>
                      $0 <Badge variant="outline">flagged: {l.reason}</Badge>
                    </>
                  ) : (
                    money(l.averageRetained)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  if (print) {
    return (
      <div className="flex flex-col gap-3">
        {table}
        {otherLinesTable}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <TcorFeesForm slug={slug} accountId={accountId} current={fees} />
      {tcor.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="rounded-lg border p-3">
            <TcorChart points={points} />
          </div>
          {table}
        </div>
      ) : (
        table
      )}
      {otherLinesTable}
      <ShowMath lines={[...mathLines.flatMap((ls, i) => (tcor[i] ? [`${tcor[i].optionLabel}:`, ...ls] : ls)), ...otherLines.flatMap((l) => l.mathLines)]} />
    </div>
  );
}
