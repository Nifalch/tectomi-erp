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

export interface BarChartDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarChartDatum[];
  color?: string;
  height?: number;
  formatValue?: (n: number) => string;
}

export function BarChart({
  data,
  color = CHART_COLORS.primary,
  height = 220,
  formatValue,
}: BarChartProps) {
  const fmt = formatValue ?? ((n: number) => n.toLocaleString());

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
          dataKey="label"
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
          formatter={(val) => [fmt(Number(val ?? 0)), "Value"]}
          contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
          cursor={{ fill: "rgba(99, 102, 241, 0.08)" }}
        />
        <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} maxBarSize={40} />
      </RBarChart>
    </ResponsiveContainer>
  );
}
