"use client";

import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS } from "./chart-colors";

export interface HorizontalBarDatum {
  label: string;
  value: number;
}

interface HorizontalBarChartProps {
  data: HorizontalBarDatum[];
  color?: string;
  height?: number;
  formatValue?: (n: number) => string;
}

export function HorizontalBarChart({
  data,
  color = CHART_COLORS.primary,
  height,
  formatValue,
}: HorizontalBarChartProps) {
  const fmt = formatValue ?? ((n: number) => n.toLocaleString());
  const resolvedHeight = height ?? Math.max(180, data.length * 38 + 40);

  if (data.length === 0) {
    return (
      <div style={{ height: resolvedHeight }} className="flex items-center justify-center text-xs text-slate-400">
        No data to display
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={resolvedHeight}>
      <RBarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => fmt(Number(v))}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fontSize: 11, fill: "#475569" }}
          tickLine={false}
          axisLine={false}
          width={110}
        />
        <Tooltip
          formatter={(val) => [fmt(Number(val ?? 0)), "Value"]}
          contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
          cursor={{ fill: "rgba(99, 102, 241, 0.08)" }}
        />
        <Bar dataKey="value" fill={color} radius={[0, 6, 6, 0]} maxBarSize={22} />
      </RBarChart>
    </ResponsiveContainer>
  );
}
