"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { formatCompactDollars } from "@/lib/domain/money";
import { TCOR_COMPONENTS, TCOR_COMPONENT_LABELS, type TcorComponent } from "@/lib/domain/strategy";
import { formatCurrency } from "@/lib/format";

// Dataviz reference palette, categorical slots 1–5 for the five TCOR components.
const COLORS: Record<TcorComponent, string> = { premiums: "#2a78d6", retained: "#eb6834", brokerFees: "#1baf7a", riskControl: "#eda100", claimsAdmin: "#e87ba4" };
const GRID = "#e6e5e1";
const AXIS_TEXT = "#52514e";

export type TcorPoint = { label: string; total: number } & Record<TcorComponent, number>;

function TcorTooltip({ active, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as TcorPoint;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">{p.label}</p>
      {TCOR_COMPONENTS.map((k) => (
        <p key={k} className="tabular-nums">
          {TCOR_COMPONENT_LABELS[k]} {formatCurrency(p[k])}
        </p>
      ))}
      <p className="mt-1 font-medium tabular-nums">Total {formatCurrency(p.total)}</p>
    </div>
  );
}

/** Stacked TCOR by option: one bar per option, one segment per component. The table beside carries the same figures. */
export function TcorChart({ points }: { points: TcorPoint[] }) {
  const shown = TCOR_COMPONENTS.filter((k) => points.some((p) => p[k] > 0));
  return (
    <div className="h-64 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS_TEXT, fontSize: 11 }} interval={0} />
          <YAxis tickLine={false} axisLine={false} width={52} tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickFormatter={(v: number) => formatCompactDollars(v).value} />
          <Tooltip content={(props) => <TcorTooltip {...(props as TooltipContentProps<number, string>)} />} cursor={{ fill: "#f0efec" }} isAnimationActive={false} />
          <Legend verticalAlign="top" iconSize={10} wrapperStyle={{ fontSize: 12, color: AXIS_TEXT }} />
          {shown.map((k, i) => (
            <Bar key={k} dataKey={k} stackId="tcor" name={`${TCOR_COMPONENT_LABELS[k]} ($)`} fill={COLORS[k]} maxBarSize={24} radius={i === shown.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
