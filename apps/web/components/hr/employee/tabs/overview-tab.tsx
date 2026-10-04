"use client";

import { Card } from "@/components/ui/card";
import type { EmployeeOverview } from "@/lib/api/employee-profile";
import { formatCurrency } from "@/lib/utils";

export function OverviewTab({ employee }: { employee: EmployeeOverview }) {
  const rows: Array<{ label: string; value: string | null | undefined }> = [
    { label: "Email", value: employee.email },
    { label: "Phone", value: employee.phone },
    { label: "Department", value: employee.department },
    { label: "Designation", value: employee.designation },
    { label: "Employment type", value: employee.employmentType?.replace("_", " ") },
    { label: "Manager", value: employee.manager },
    { label: "Salary", value: employee.salary != null ? formatCurrency(employee.salary) : null },
    { label: "Hourly rate", value: employee.hourlyRate != null ? `${formatCurrency(employee.hourlyRate)}/hr` : null },
    { label: "Performance", value: employee.performanceScore != null ? employee.performanceScore.toFixed(1) : null },
    { label: "Emergency contact", value: employee.emergencyContact },
    { label: "Joined", value: employee.joinDate ? new Date(employee.joinDate).toLocaleDateString() : null },
  ].filter((r) => r.value != null && r.value !== "");

  return (
    <Card>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between border-b border-slate-100 py-1 dark:border-slate-800">
            <dt className="text-sm text-slate-500">{r.label}</dt>
            <dd className="text-sm font-medium text-slate-900 dark:text-white">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
