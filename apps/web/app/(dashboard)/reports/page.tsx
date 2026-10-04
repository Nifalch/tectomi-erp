"use client";

import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  Scale,
  FileSpreadsheet,
  Wallet,
  Receipt,
  Users,
  Layers,
  ClipboardList,
  Building2,
} from "lucide-react";
import { ModuleHeader } from "@/components/layout/module-header";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

type ReportCard = {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
};

type Group = { title: string; items: ReportCard[] };

const groups: Group[] = [
  {
    title: "Financial Statements",
    items: [
      { title: "Profit & Loss", description: "Income minus expenses for the period.", href: "/reports/profit-loss", icon: <TrendingUp className="size-5" /> },
      { title: "Balance Sheet", description: "Assets, liabilities, and equity as of date.", href: "/reports/balance-sheet", icon: <Scale className="size-5" /> },
      { title: "Trial Balance", description: "Debit and credit balances by account.", href: "/reports/trial-balance", icon: <FileSpreadsheet className="size-5" /> },
      { title: "Cash Flow", description: "Operating, investing, and financing cash.", href: "/reports/cash-flow", icon: <Wallet className="size-5" /> },
    ],
  },
  {
    title: "Sales",
    items: [
      { title: "Sales by Customer", description: "Revenue breakdown by client.", href: "/reports/sales-by-customer", icon: <Users className="size-5" /> },
      { title: "Customer Statement", description: "Detailed statement for one client.", href: "/reports/customer-statement", icon: <ClipboardList className="size-5" /> },
    ],
  },
  {
    title: "Purchases",
    items: [
      { title: "Expenses by Category", description: "Spend grouped by expense category.", href: "/reports/expenses-by-category", icon: <BarChart3 className="size-5" /> },
    ],
  },
  {
    title: "Tax",
    items: [
      { title: "Tax Summary", description: "Collected and paid tax, net payable.", href: "/reports/tax-summary", icon: <Receipt className="size-5" /> },
    ],
  },
  {
    title: "Aging",
    items: [
      { title: "AR Aging", description: "Outstanding receivables by bucket.", href: "/reports/ar-aging", icon: <Building2 className="size-5" /> },
      { title: "AP Aging", description: "Outstanding payables by bucket.", href: "/reports/ap-aging", icon: <Layers className="size-5" /> },
    ],
  },
];

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-8">
      <ModuleHeader
        module="reports"
        title="Reports & Analytics"
        description="Financial and operational reporting with exports."
      />
      {groups.map((group) => (
        <section key={group.title} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">{group.title}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className="group">
                <Card className="h-full transition hover:border-primary/60 hover:shadow-lg">
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 group-hover:bg-rose-500/20">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-base">{item.title}</CardTitle>
                      <CardDescription className="mt-1">{item.description}</CardDescription>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
