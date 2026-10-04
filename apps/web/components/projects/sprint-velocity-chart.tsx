"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardTitle } from "@/components/ui/card";
import { useSprintVelocity } from "@/lib/api/hooks";

interface VelocitySprint {
  name: string;
  startDate?: string;
  endDate?: string;
  plannedPoints: number;
  completedPoints: number;
  status?: string;
}

interface VelocityResponse {
  sprints: VelocitySprint[];
  averageVelocity: number;
  completedSprintCount: number;
}

export function SprintVelocityChart({ projectId }: { projectId: string }) {
  const query = useSprintVelocity(projectId);
  const data = (query.data ?? {}) as Partial<VelocityResponse>;

  const sprints = Array.isArray(data.sprints) ? data.sprints : [];
  const avg = typeof data.averageVelocity === "number" ? data.averageVelocity : 0;
  const completedCount = typeof data.completedSprintCount === "number" ? data.completedSprintCount : 0;

  if (query.isLoading) {
    return (
      <Card>
        <CardTitle>Sprint Velocity</CardTitle>
        <div className="py-8 text-center text-xs text-slate-400">Loading…</div>
      </Card>
    );
  }

  // Only show if at least 1 completed sprint
  if (!completedCount || sprints.length === 0) {
    return null;
  }

  const chartData = sprints.map((s) => ({
    label: s.name,
    Planned: Number(s.plannedPoints) || 0,
    Completed: Number(s.completedPoints) || 0,
  }));

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <CardTitle>Sprint Velocity</CardTitle>
        <span className="text-[10px] uppercase tracking-wider text-slate-400">
          Planned vs completed story points
        </span>
      </div>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
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
              width={40}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
              cursor={{ fill: "rgba(99, 102, 241, 0.06)" }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              iconType="circle"
              iconSize={8}
            />
            <Bar dataKey="Planned" fill="#c7d2fe" radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Bar dataKey="Completed" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-baseline justify-between border-t border-border/50 pt-3 text-sm">
        <span className="text-slate-500 dark:text-slate-400">Average velocity</span>
        <span className="text-slate-700 dark:text-slate-200">
          <span className="text-xl font-semibold text-slate-900 dark:text-white">
            {avg.toFixed(1)}
          </span>{" "}
          points{" "}
          <span className="text-xs text-slate-400">
            (across {completedCount} completed sprint{completedCount === 1 ? "" : "s"})
          </span>
        </span>
      </div>
    </Card>
  );
}
