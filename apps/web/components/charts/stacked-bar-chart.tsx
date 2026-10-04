"use client";

import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_PALETTE } from "./chart-colors";

interface StackedBarChartProps {
  data: Array<Record<string, string | number>>;
  keys: string[];
  colors?: string[];
  height?: number;
  formatValue?: (n: number) => string;
  labelKey?: string;
}

export function StackedBarChart({
  data,
  keys,
  colors,
  height = 240,
  formatValue,
  labelKey = "label",
}: StackedBarChartProps) {
  const fmt = formatValue ?? ((n: number) => n.toLocaleString());
  const palette = colors ?? CHART_PALETTE;

  if (data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-slate-400">
        No data to display
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey={labelKey}
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => fmt(Number(v))}
          width={60}
        />
        <Tooltip
          formatter={(val) => fmt(Number(val ?? 0))}
          contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
          cursor={{ fill: "rgba(99, 102, 241, 0.08)" }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
        {keys.map((k, i) => (
          <Bar key={k} dataKey={k} stackId="stack" fill={palette[i % palette.length]} radius={i === keys.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]} maxBarSize={40} />
        ))}
      </RBarChart>
    </ResponsiveContainer>
  );
}
