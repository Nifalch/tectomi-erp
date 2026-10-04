"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_PALETTE } from "./chart-colors";

export interface DonutChartDatum {
  label: string;
  value: number;
  color?: string;
}

interface DonutChartProps {
  data: DonutChartDatum[];
  total?: string;
  totalLabel?: string;
  height?: number;
  formatValue?: (n: number) => string;
  compact?: boolean;
}

export function DonutChart({
  data,
  total,
  totalLabel,
  height = 240,
  formatValue,
  compact = false,
}: DonutChartProps) {
  const fmt = formatValue ?? ((n: number) => n.toLocaleString());
  const nonEmpty = data.filter((d) => d.value > 0);

  if (nonEmpty.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-slate-400">
        No data to display
      </div>
    );
  }

  const innerRadius = compact ? 28 : 56;
  const outerRadius = compact ? 42 : 80;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={nonEmpty}
              dataKey="value"
              nameKey="label"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={2}
              stroke="none"
            >
              {nonEmpty.map((entry, i) => (
                <Cell key={i} fill={entry.color ?? CHART_PALETTE[i % CHART_PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(val, name) => [fmt(Number(val ?? 0)), String(name)]}
              contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
        {total && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className={compact ? "text-sm font-bold" : "text-xl font-bold text-slate-900 dark:text-white"}>{total}</span>
            {totalLabel && <span className="text-[10px] uppercase tracking-wider text-slate-400">{totalLabel}</span>}
          </div>
        )}
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
          {nonEmpty.map((entry, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: entry.color ?? CHART_PALETTE[i % CHART_PALETTE.length] }}
              />
              <span className="text-slate-600 dark:text-slate-400">{entry.label}</span>
              <span className="font-semibold text-slate-900 dark:text-white">{fmt(entry.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
