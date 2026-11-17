import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { describePartLimits, describeRule, type DeductibleKind } from "@/lib/domain/deductibles";

export interface CoveragePartView {
  appliesTo: string;
  isDefault: boolean;
  kind: DeductibleKind;
  amount: number | null;
  percent: number | null;
  minimum: number | null;
  maximum: number | null;
  hours: number | null;
  occurrenceLimit: number | null;
  aggregateLimit: number | null;
}

/**
 * "6 coverage parts" with, on hover or focus, each part's deductible and its own
 * limits (v1.5.1). Nothing is shown for a policy whose schedule is just the
 * default row.
 */
export function CoveragePartsChip({ parts, className }: { parts: CoveragePartView[]; className?: string }) {
  const named = parts.filter((p) => !p.isDefault);
  if (named.length === 0) return null;
  const lines = named.map((p) => {
    const ded = p.kind === "flat" && p.amount === null ? "no deductible" : describeRule({ ...p, isDefault: false }).replace(`${p.appliesTo}: `, "");
    const limits = describePartLimits(p);
    return `${p.appliesTo}: ${ded}${limits ? `; ${limits}` : ""}`;
  });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" tabIndex={0} className={cn("cursor-help font-normal", className)} aria-label={`${named.length} coverage ${named.length === 1 ? "part" : "parts"}: ${lines.join("; ")}`}>
          {named.length} coverage {named.length === 1 ? "part" : "parts"}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm whitespace-normal text-left">
        <ul className="flex flex-col gap-0.5">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}
