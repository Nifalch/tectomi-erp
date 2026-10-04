"use client";

import { Card } from "@/components/ui/card";
import type { HubKpis } from "@/lib/api/hr-hub";
import { formatCurrency } from "@/lib/utils";

export function KpiStrip({ kpis }: { kpis: HubKpis }) {
  const items = [
    { label: "Headcount", value: kpis.headcount.toString() },
    { label: "New hires (MTD)", value: kpis.newHiresThisMonth.toString() },
    { label: "Attrition (Q)", value: `${kpis.attritionThisQuarter.toFixed(1)}%` },
    { label: "Avg tenure", value: `${kpis.averageTenureYears.toFixed(1)} yr` },
    { label: "Open positions", value: kpis.openPositions.toString() },
    { label: "Payroll MTD", value: formatCurrency(kpis.payrollCostMtd) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => (
        <Card key={it.label} className="p-3">
          <div className="text-xs uppercase tracking-wider text-slate-400">{it.label}</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{it.value}</div>
        </Card>
      ))}
    </div>
  );
}
