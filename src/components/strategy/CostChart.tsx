"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { formatCompactDollars } from "@/lib/domain/money";
import { formatCurrency } from "@/lib/format";

// Dataviz reference palette: slot 1 blue for the expected series, slot 2 orange for the worst year.
const EXPECTED = "#2a78d6";
const WORST = "#eb6834";
const GRID = "#e6e5e1";
const AXIS_TEXT = "#52514e";

export interface CostPoint {
  label: string;
  expected: number;
  worst: number;
  worstYear: string | null;
}

function CostTooltip({ active, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as CostPoint;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">{p.label}</p>
      <p className="tabular-nums">Expected total cost {formatCurrency(p.expected)}</p>
      <p className="tabular-nums">
        Worst-year total {formatCurrency(p.worst)}
        {p.worstYear ? ` (${p.worstYear})` : ""}
      </p>
    </div>
  );
}

/** Expected total cost by option (premium + average retained) with the worst-year total as a second series. The comparison table carries the same figures. */
export function CostChart({ points }: { points: CostPoint[] }) {
  return (
    <div className="h-64 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={4}>
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS_TEXT, fontSize: 11 }} interval={0} />
          <YAxis tickLine={false} axisLine={false} width={52} tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickFormatter={(v: number) => formatCompactDollars(v).value} />
          <Tooltip content={(props) => <CostTooltip {...(props as TooltipContentProps<number, string>)} />} cursor={{ fill: "#f0efec" }} isAnimationActive={false} />
          <Legend verticalAlign="top" iconSize={10} wrapperStyle={{ fontSize: 12, color: AXIS_TEXT }} />
          <Bar dataKey="expected" name="Expected total cost ($ per year)" fill={EXPECTED} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="worst" name="Worst-year total cost ($)" fill={WORST} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
