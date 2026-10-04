"use client";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useHrOverview } from "@/lib/api/hooks";

export function ResourceHeatmap() {
  const { data } = useHrOverview();

  const employees = (data?.employees ?? []) as Array<{ department: string; performanceScore?: number }>;

  // Group by department and calculate average utilization
  const departments: Record<string, { count: number; totalScore: number }> = {};
  for (const emp of employees) {
    if (!departments[emp.department]) departments[emp.department] = { count: 0, totalScore: 0 };
    departments[emp.department].count++;
    departments[emp.department].totalScore += Number(emp.performanceScore ?? 3);
  }

  const deptList = Object.entries(departments).map(([name, data]) => ({
    name,
    saturation: Math.round((data.totalScore / data.count) * 20),
    count: data.count,
  })).sort((a, b) => b.saturation - a.saturation);

  return (
    <Card>
      <CardDescription>Department capacity</CardDescription>
      <CardTitle className="mt-1">Resource utilization</CardTitle>
      <div className="mt-5 space-y-3">
        {deptList.length === 0 ? (
          <p className="text-sm text-slate-400">No department data available.</p>
        ) : (
          deptList.map((dept) => (
            <div key={dept.name}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-600 dark:text-slate-300">{dept.name}</span>
                <span className="text-xs text-slate-500">{dept.saturation}% · {dept.count} people</span>
              </div>
              <Progress
                value={dept.saturation}
                className="mt-1.5"
              />
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
