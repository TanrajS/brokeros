import { cn } from "cn";
import type { Readiness } from "@/lib/domain/renewals";

/** "3 of 5 ready" with a bar. The text carries the meaning; the bar is decorative. */
export function ReadinessMeter({ readiness, notOpened, className }: { readiness: Readiness; notOpened?: boolean; className?: string }) {
  const pct = readiness.ratio === null ? 0 : Math.round(readiness.ratio * 100);
  return (
    <div className={cn("flex min-w-28 flex-col gap-1", className)}>
      <span className={cn("text-xs", readiness.readyToMarket ? "font-medium text-emerald-700" : "text-muted-foreground")}>
        {readiness.label}
        {notOpened ? <span className="sr-only"> (checklist not opened yet)</span> : null}
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={cn("h-full rounded-full", readiness.readyToMarket ? "bg-emerald-600" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
