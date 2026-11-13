import { STAGE_RULES } from "@/lib/domain/renewals";

/** The exact rules getRenewalStage applies, rendered from the same source. */
export function StageRulesPanel({ asOf }: { asOf: string }) {
  return (
    <details className="group rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer rounded-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">Stage rules</summary>
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-muted-foreground">
          Days to expiry are counted from the workspace as-of date ({asOf}), never today&apos;s clock. Rules are checked top to bottom; the first match wins.
        </p>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Stage
              </th>
              <th scope="col" className="py-1.5 font-medium">
                Rule
              </th>
            </tr>
          </thead>
          <tbody>
            {STAGE_RULES.map((r) => (
              <tr key={r.stage} className="border-b last:border-0">
                <th scope="row" className="py-1.5 pr-3 font-medium whitespace-nowrap">
                  {r.stage}
                </th>
                <td className="py-1.5">{r.rule}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
