"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS } from "./chart-colors";

export interface BurndownDatum {
  label: string;
  remaining?: number;
  ideal?: number;
}

interface Props {
  data: BurndownDatum[];
  height?: number;
}

export function BurndownChart({ data, height = 240 }: Props) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-xs text-slate-400">
        No burndown data yet. Capture a snapshot to start.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="burndown-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.4} />
            <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
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
          width={50}
        />
        <Tooltip
          contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
        />
        <Area
          type="monotone"
          dataKey="remaining"
          stroke={CHART_COLORS.primary}
          strokeWidth={2}
          fill="url(#burndown-area)"
          name="Remaining"
        />
        <Line
          type="monotone"
          dataKey="ideal"
          stroke={CHART_COLORS.slate}
          strokeDasharray="4 4"
          strokeWidth={2}
          dot={false}
          name="Ideal"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
