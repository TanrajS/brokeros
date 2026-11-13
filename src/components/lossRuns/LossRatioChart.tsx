"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { formatCompactDollars } from "@/lib/domain/money";
import { formatCurrency, formatRatioPercent } from "@/lib/format";

// Dataviz reference palette, light surface: slot 1 blue for incurred, slot 2 orange for loss ratio.
const INCURRED = "#2a78d6";
const RATIO = "#eb6834";
const GRID = "#e6e5e1";
const AXIS_TEXT = "#52514e";

export interface ChartYear {
  label: string;
  incurred: number;
  /** Percent (96.4 for 96.4%), null when there is no earned premium. */
  lossRatioPct: number | null;
  earnedToDate: boolean;
}

function ChartTooltip({ active, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const y = payload[0].payload as ChartYear;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">
        {y.label}
        {y.earnedToDate ? " (earned to date)" : ""}
      </p>
      <p className="tabular-nums">Incurred {formatCurrency(y.incurred)}</p>
      <p className="tabular-nums">Loss ratio {y.lossRatioPct === null ? "—" : formatRatioPercent(y.lossRatioPct / 100)}</p>
    </div>
  );
}

/**
 * Incurred by policy year (bars, left axis) with loss ratio (line, right axis), as
 * requested. Both axes start at zero; the legend names each series and its axis,
 * the ticks carry $ and % units, and the table beneath carries the same figures.
 */
export function LossRatioChart({ years, basisLabel }: { years: ChartYear[]; basisLabel: string }) {
  return (
    <div className="h-72 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={years} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: AXIS_TEXT, fontSize: 11 }} interval={0} />
          <YAxis
            yAxisId="incurred"
            tickLine={false}
            axisLine={false}
            width={52}
            tick={{ fill: AXIS_TEXT, fontSize: 11 }}
            tickFormatter={(v: number) => formatCompactDollars(v).value}
          />
          <YAxis
            yAxisId="ratio"
            orientation="right"
            tickLine={false}
            axisLine={false}
            width={44}
            domain={[0, (max: number) => Math.max(100, Math.ceil(max / 25) * 25)]}
            tick={{ fill: AXIS_TEXT, fontSize: 11 }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} />} cursor={{ fill: "#f0efec" }} isAnimationActive={false} />
          <Legend verticalAlign="top" iconSize={10} wrapperStyle={{ fontSize: 12, color: AXIS_TEXT }} />
          <Bar yAxisId="incurred" dataKey="incurred" name={`Incurred, ${basisLabel} (left axis, $)`} fill={INCURRED} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Line
            yAxisId="ratio"
            dataKey="lossRatioPct"
            name="Loss ratio (right axis, %)"
            stroke={RATIO}
            strokeWidth={2}
            dot={{ r: 4, fill: RATIO, stroke: "#fcfcfb", strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
