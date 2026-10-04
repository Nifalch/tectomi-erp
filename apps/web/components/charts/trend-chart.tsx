"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS } from "./chart-colors";

export interface TrendChartDatum {
  label: string;
  value: number;
}

interface TrendChartProps {
  data: TrendChartDatum[];
  color?: string;
  type?: "line" | "area";
  height?: number;
  formatValue?: (n: number) => string;
}

export function TrendChart({
  data,
  color = CHART_COLORS.primary,
  type = "area",
  height = 220,
  formatValue,
}: TrendChartProps) {
  const gradientId = `trend-gradient-${color.replace("#", "")}`;
  const fmt = formatValue ?? ((n: number) => n.toLocaleString());

  if (data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-slate-400">
        No data to display
      </div>
    );
  }

  const content = type === "area" ? (
    <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
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
      />
      <Area
        type="monotone"
        dataKey="value"
        stroke={color}
        strokeWidth={2}
        fill={`url(#${gradientId})`}
      />
    </AreaChart>
  ) : (
    <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
      />
      <Line
        type="monotone"
        dataKey="value"
        stroke={color}
        strokeWidth={2}
        dot={{ r: 3, fill: color }}
        activeDot={{ r: 5 }}
      />
    </LineChart>
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      {content}
    </ResponsiveContainer>
  );
}
