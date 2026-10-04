"use client";

import Link from "next/link";
import { format, startOfMonth } from "date-fns";
import { ArrowRight, TrendingUp, TrendingDown, Building2, Layers } from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useArAging, useApAging, useProfitLoss } from "@/lib/api/hooks";
import { formatCurrency } from "@/lib/utils";

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

export function FinanceHealth() {
  const today = new Date();
  const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
  const todayStr = format(today, "yyyy-MM-dd");

  const pl = useProfitLoss(monthStart, todayStr);
  const ar = useArAging();
  const ap = useApAging();

  const revenue = num(pl.data?.totalIncome ?? pl.data?.income?.total ?? pl.data?.totalRevenue);
  const netProfit = num(pl.data?.netProfit ?? pl.data?.netIncome);
  const arTotal = num(ar.data?.grandTotal ?? ar.data?.total);
  const apTotal = num(ap.data?.grandTotal ?? ap.data?.total);

  const items = [
    {
      title: "Revenue This Month",
      value: formatCurrency(revenue),
      icon: <TrendingUp className="size-4" />,
      tone: "text-emerald-600",
      href: "/reports/profit-loss",
    },
    {
      title: "Net Profit",
      value: formatCurrency(netProfit),
      icon: netProfit >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />,
      tone: netProfit >= 0 ? "text-emerald-600" : "text-red-600",
      href: "/reports/profit-loss",
    },
    {
      title: "Accounts Receivable",
      value: formatCurrency(arTotal),
      icon: <Building2 className="size-4" />,
      tone: "text-amber-600",
      href: "/reports/ar-aging",
    },
    {
      title: "Accounts Payable",
      value: formatCurrency(apTotal),
      icon: <Layers className="size-4" />,
      tone: "text-rose-600",
      href: "/reports/ap-aging",
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Financial Health</h2>
        <Link href="/reports">
          <Button variant="ghost" size="sm">
            All reports <ArrowRight className="ml-1 size-3.5" />
          </Button>
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {items.map((it) => (
          <Link key={it.title} href={it.href} className="block">
            <Card className="h-full transition hover:border-primary/60">
              <div className="flex items-center justify-between">
                <CardDescription>{it.title}</CardDescription>
                <span className={it.tone}>{it.icon}</span>
              </div>
              <CardTitle className={`mt-3 text-2xl ${it.tone}`}>{it.value}</CardTitle>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
