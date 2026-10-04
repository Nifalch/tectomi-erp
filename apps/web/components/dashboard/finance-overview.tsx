"use client";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { useFinanceSummary } from "@/lib/api/hooks";
import { formatCurrency } from "@/lib/utils";

export function FinanceOverview() {
  const { data } = useFinanceSummary();

  const totals = (data as { totals?: { revenue?: number; expenses?: number; net?: number } })?.totals;
  const revenue = Number(totals?.revenue) || 0;
  const expenses = Number(totals?.expenses) || 0;
  const net = revenue - expenses;

  const items = [
    { label: "Revenue", value: revenue, color: "text-emerald-600" },
    { label: "Expenses", value: expenses, color: "text-red-500" },
    { label: "Net Profit", value: net, color: net >= 0 ? "text-emerald-600" : "text-red-500" },
  ];

  return (
    <Card>
      <CardDescription>Financial snapshot</CardDescription>
      <CardTitle className="mt-1">Finance overview</CardTitle>
      <div className="mt-5 space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between border-b border-border/30 pb-3 last:border-0">
            <span className="text-sm text-slate-600 dark:text-slate-400">{item.label}</span>
            <span className={`text-sm font-semibold ${item.color}`}>{formatCurrency(item.value)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
