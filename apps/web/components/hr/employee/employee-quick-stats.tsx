"use client";

import { Card } from "@/components/ui/card";
import type { EmployeeOverview } from "@/lib/api/employee-profile";
import { formatCurrency } from "@/lib/utils";

interface Props {
  employee: EmployeeOverview;
}

export function EmployeeQuickStats({ employee }: Props) {
  const items: Array<{ label: string; value: string }> = [];
  if (employee.salary != null) items.push({ label: "Salary", value: formatCurrency(employee.salary) });
  if (employee.performanceScore != null)
    items.push({ label: "Performance", value: employee.performanceScore.toFixed(1) });
  if (employee.employmentType)
    items.push({ label: "Employment", value: employee.employmentType.replace("_", " ") });
  if (employee.joinDate)
    items.push({ label: "Joined", value: new Date(employee.joinDate).toLocaleDateString() });

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((it) => (
        <Card key={it.label} className="p-4">
          <div className="text-xs uppercase tracking-wider text-slate-400">{it.label}</div>
          <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{it.value}</div>
        </Card>
      ))}
    </div>
  );
}
