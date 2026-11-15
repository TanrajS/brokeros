"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { NativeCheckbox } from "@/components/form/Checkbox";
import { ShowMath } from "@/components/dashboard/ShowMath";
import type { Finding, Modifier } from "@/lib/domain/strategy";
import { formatCurrency } from "@/lib/format";
import { setFindingAccepted } from "@/server/strategy/actions";

interface Props {
  slug: string;
  accountId: string;
  findings: Finding[];
  modifiers: Modifier[];
  accepted: string[];
  /** Report view: no toggles, accepted findings only. */
  print?: boolean;
}

const KIND_LABEL: Record<Finding["kind"], string> = {
  self_insure: "Retention",
  raise_deductible: "Retention",
  catastrophe_price: "Price",
  inverted_pricing: "Price",
  line_above_layer: "Price",
  rate_above_exposure: "Price",
  underinsured: "Limit",
  excess_limit: "Limit",
};

/** Findings sorted by estimated impact, each with its evidence, caveats, suggested action and math; an Accept-into-report toggle per finding. */
export function FindingsList({ slug, accountId, findings, modifiers, accepted, print = false }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [acceptedSet, setAccepted] = useOptimistic(new Set(accepted), (prev: Set<string>, next: { id: string; on: boolean }) => {
    const copy = new Set(prev);
    if (next.on) copy.add(next.id);
    else copy.delete(next.id);
    return copy;
  });
  const shown = print ? findings.filter((f) => acceptedSet.has(f.id)) : findings;

  function toggle(id: string, on: boolean) {
    startTransition(async () => {
      setAccepted({ id, on });
      const res = await setFindingAccepted(slug, accountId, id, on);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {shown.length === 0 ? (
        <p className={print ? "text-xs" : "rounded-lg border p-4 text-sm text-muted-foreground"}>{print ? "No findings were accepted into this report." : "No findings: the program, loss history and tolerances give the engine nothing to flag."}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {shown.map((f, i) => (
            <li key={f.id} className={print ? "flex flex-col gap-1 rounded-lg border p-3 text-xs break-inside-avoid" : "flex flex-col gap-2 rounded-lg border p-4"}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className={print ? "font-semibold" : "text-base font-semibold"}>
                    {i + 1}. {f.title}
                  </h3>
                  <span className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">{KIND_LABEL[f.kind]}</Badge>
                    <Badge variant={f.estimatedImpact === null ? "secondary" : "default"}>{f.estimatedImpact === null ? "Comment, no dollar impact" : `Estimated impact ${formatCurrency(f.estimatedImpact)} a year`}</Badge>
                    {acceptedSet.has(f.id) && !print ? <Badge variant="outline">In the report</Badge> : null}
                  </span>
                </div>
                {print ? null : <NativeCheckbox id={`accept-${f.id}`} label="Accept into report" checked={acceptedSet.has(f.id)} onChange={(e) => toggle(f.id, e.target.checked)} />}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Evidence</p>
                <ul className="list-disc pl-5 text-sm print:text-xs">
                  {f.evidence.map((e, k) => (
                    <li key={k}>{e}</li>
                  ))}
                </ul>
              </div>
              {f.caveats.length ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Caveats</p>
                  <ul className="list-disc pl-5 text-sm print:text-xs">
                    {f.caveats.map((c, k) => (
                      <li key={k}>{c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="text-sm print:text-xs">
                <span className="font-medium">Suggested action: </span>
                {f.suggestedAction}
              </p>
              {print ? (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Math</summary>
                  <ul className="mt-1 list-disc pl-5 font-mono">
                    {f.math.map((m, k) => (
                      <li key={k}>{m}</li>
                    ))}
                  </ul>
                </details>
              ) : (
                <ShowMath lines={f.math} />
              )}
            </li>
          ))}
        </ol>
      )}
      <div className={print ? "text-xs" : "rounded-lg bg-muted/40 p-3 text-sm"}>
        <p className="mb-1 font-medium">Read the findings with these modifiers in mind</p>
        <ul className="list-disc pl-5">
          {modifiers.map((m) => (
            <li key={m.key}>{m.text}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
