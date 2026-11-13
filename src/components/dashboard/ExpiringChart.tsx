"use client";

import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { formatCompactDollars } from "@/lib/domain/money";
import type { MonthBucket } from "@/lib/domain/dashboard";
import { formatCurrency } from "@/lib/format";

// Chart tokens (dataviz reference palette, light surface). One series, so one hue and no legend.
const SERIES = "#2a78d6";
const GRID = "#e6e5e1";
const AXIS_TEXT = "#52514e";

export interface ChartBucket extends MonthBucket {
  href: string;
}

function ChartTooltip({ active, payload }: TooltipContentProps<number, string>) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload as ChartBucket;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-sm">
      <p className="font-medium">{b.label}</p>
      <p className="tabular-nums">{formatCurrency(b.premium)}</p>
      <p className="text-muted-foreground">
        {b.count} open {b.count === 1 ? "policy" : "policies"}
        {b.count > 0 ? " · click to open in Renewals" : ""}
      </p>
    </div>
  );
}

/** Expiring premium by month. Decorative for assistive tech: the table beneath carries the same data and links. */
export function ExpiringChart({ buckets }: { buckets: ChartBucket[] }) {
  const router = useRouter();
  const dense = buckets.length > 7;
  return (
    <div className="h-64 w-full" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 4, bottom: dense ? 8 : 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: GRID }}
            interval={0}
            tick={{ fill: AXIS_TEXT, fontSize: 11 }}
            tickFormatter={(label: string) => `${label.slice(0, 3)} '${label.slice(-2)}`}
            angle={dense ? -45 : 0}
            textAnchor={dense ? "end" : "middle"}
            height={dense ? 44 : 24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tick={{ fill: AXIS_TEXT, fontSize: 11 }}
            tickFormatter={(v: number) => formatCompactDollars(v).value}
          />
          <Tooltip content={(props) => <ChartTooltip {...(props as TooltipContentProps<number, string>)} />} cursor={{ fill: "#f0efec" }} isAnimationActive={false} />
          <Bar
            dataKey="premium"
            fill={SERIES}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            cursor="pointer"
            onClick={(_item, index) => {
              const b = buckets[index];
              if (b && b.count > 0) router.push(b.href);
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
