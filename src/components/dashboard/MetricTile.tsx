import { Missing } from "@/components/Missing";
import { ShowMath } from "./ShowMath";

interface Props {
  label: string;
  /** Formatted value, or null to show an em dash naming what is missing. */
  value: string | null;
  missing: string;
  /** Labels the denominator / basis in words. */
  detail: React.ReactNode;
  lines: string[];
  note?: React.ReactNode;
}

export function MetricTile({ label, value, missing, detail, lines, note }: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border p-3">
      <h3 className="text-xs font-medium text-muted-foreground">{label}</h3>
      <p className="text-2xl font-semibold tabular-nums">{value === null ? <Missing what={missing} /> : value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
      {note ? <div className="text-xs">{note}</div> : null}
      <ShowMath lines={lines} />
    </div>
  );
}
